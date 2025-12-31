import {getBitArray, getUintArray, opp_dir, check_coll} from "./functions_util.js";
import {TC_map, seg_map, switch_list, route_list, signal_list, train_list} from "./station_data.js";



const n_TC = TC_map.size; 
const n_sw = switch_list.length;
const n_sig = signal_list.length;
const controllable_signal_list = signal_list.filter((sig) => !sig.always_closed);
const n_controllable_sig = controllable_signal_list.length;
const n_route = route_list.length;

const n_octet_TC = Math.ceil(n_TC/8);
const n_octet_sw = Math.ceil(n_sw/8);
const n_octet_sig = Math.ceil(n_controllable_sig/8);
const n_octet_route = Math.ceil(n_route/8);

const TC_occupation_octet = 0;
const Switch_detected_left_octet = n_octet_TC;
const Switch_detected_right_octet = Switch_detected_left_octet + n_octet_sw;
const Switch_manual_override_octet = Switch_detected_right_octet + n_octet_sw;
const Force_signal_closing_octet = Switch_manual_override_octet + n_octet_sw;
const Ignore_TC_occupation_octet = Force_signal_closing_octet + n_octet_sig;
const Ignore_approach_octet = Ignore_TC_occupation_octet + n_octet_TC;
const Route_formation_demand_octet = Ignore_approach_octet + n_octet_route;
const Route_destruction_demand_octet = Route_formation_demand_octet + n_octet_route;

const Route_state_octet = 0;
const Signal_open_octet = n_octet_route;
const Switch_command_left_octet = Signal_open_octet + n_octet_sig;
const Switch_command_right_octet = Switch_command_left_octet + n_octet_sw;

const PLC_output_size = Switch_command_right_octet + n_octet_sw;
const PLC_input_size = Route_destruction_demand_octet + n_octet_route;

let output_vector;
const input_buffer = new ArrayBuffer(PLC_input_size);
const input_vector = new Uint8Array(input_buffer);

function readPlcOutputs(output_vector) {
  const PLC_out_bit_arr = getBitArray(output_vector);
  for (let sw of switch_list) {
    let sw_octet = Math.floor(sw.bit_index/8);
    let sw_bit = sw.bit_index % 8;
    sw.commanded_left = PLC_out_bit_arr[Switch_command_left_octet + sw_octet][sw_bit];
    sw.commanded_right = PLC_out_bit_arr[Switch_command_right_octet + sw_octet][sw_bit];
  }
  for (let route of route_list) {
    let route_octet = Math.floor(route.bit_index/8);
    let route_bit = route.bit_index % 8;
    route.opened = PLC_out_bit_arr[Route_state_octet + route_octet][route_bit];
  }
  for (let signal of controllable_signal_list) {
    let signal_octet = Math.floor(signal.bit_index/8);
    let signal_bit = signal.bit_index % 8;
    signal.opened = PLC_out_bit_arr[Signal_open_octet + signal_octet][signal_bit];
  }
}

function writePlcInputs(uint_array) {
  const PLC_in_bit_arr = new Array(PLC_input_size);
  for (let i = 0; i < PLC_in_bit_arr.length; i++) {
    PLC_in_bit_arr[i] = [false, false, false, false, false, false, false, false];
  }
  for (let sw of switch_list) {
    let sw_octet = Math.floor(sw.bit_index/8);
    let sw_bit = sw.bit_index % 8;
    let detected_left = (sw.pos === "left") && !sw.sensor_fail_left;
    let detected_right = (sw.pos === "right") && !sw.sensor_fail_right;
    PLC_in_bit_arr[Switch_detected_left_octet + sw_octet][sw_bit] = detected_left;
    PLC_in_bit_arr[Switch_detected_right_octet + sw_octet][sw_bit] = detected_right;
    PLC_in_bit_arr[Switch_manual_override_octet + sw_octet][sw_bit] = sw.manual_control;
  }
  for (let route of route_list) {
    let route_octet = Math.floor(route.bit_index/8);
    let route_bit = route.bit_index % 8;
    PLC_in_bit_arr[Ignore_approach_octet + route_octet][route_bit] = route.ignore_approach;
    PLC_in_bit_arr[Route_formation_demand_octet + route_octet][route_bit] = route.formation_command;
    PLC_in_bit_arr[Route_destruction_demand_octet + route_octet][route_bit] = route.destruction_command;
  }
  for (let signal of controllable_signal_list) {
    let signal_octet = Math.floor(signal.bit_index/8);
    let signal_bit = signal.bit_index % 8;
    PLC_in_bit_arr[Force_signal_closing_octet + signal_octet][signal_bit] = signal.close_command;
  }
  for (let TC of TC_map.values()) {
    let TC_octet = Math.floor(TC.bit_index/8);
    let TC_bit = TC.bit_index % 8;
    PLC_in_bit_arr[TC_occupation_octet + TC_octet][TC_bit] = TC.occupied;
    PLC_in_bit_arr[Ignore_TC_occupation_octet + TC_octet][TC_bit] = TC.occupation_ignored;
  }
  getUintArray(PLC_in_bit_arr, uint_array);
}

function removeTrains() {
  for (let train of train_list) {
    clearTimeout(train.move_timeOut);
    train.exists = false;
    train.rear_pos = [null, -1];
    train.front_pos = [null, -1];
    train.orientation = "NA";
    train.error = false;
    train.timer_move = false;
  }
  for (let seg of seg_map.values()) {
    seg.partial_occup = [];
  }
}

function failureTC(TC) {
  TC.failed = !TC.failed
}

function ignoreOccupation(TC) {
  TC.occupation_ignored = !TC.occupation_ignored
}

function sendTrain(seg, dir) {
  let [prev_seg, opp_prev_dir] = seg.next_seg(opp_dir(dir))
  let front_pos_abs;
  let rear_pos_abs;
  let new_pos_front;
  let new_pos_rear;
  if (dir === "up") {
    front_pos_abs = 0.45;
    new_pos_front = ["", 0, front_pos_abs];
  } else {
    front_pos_abs = 0.55;
    new_pos_front = ["", front_pos_abs, 1];
  }
  if (opp_prev_dir === "up") {
    rear_pos_abs = 0.45;
    new_pos_rear = ["", 0, rear_pos_abs];
  } else {
    rear_pos_abs = 0.55;
    new_pos_rear = ["", rear_pos_abs, 1];
  }
  if (!check_coll(new_pos_front, seg.partial_occup) && !check_coll(new_pos_rear, prev_seg.partial_occup)) {
    for (let train of train_list) {
      if (!train.exists) {
        train.exists = true;
        train.rear_pos = [prev_seg, rear_pos_abs];
        train.front_pos = [seg, front_pos_abs];
        train.orientation = dir;
        seg.partial_occup.push([train, new_pos_front[1], new_pos_front[2]]);
        prev_seg.partial_occup.push([train, new_pos_rear[1], new_pos_rear[2]]);
        break;
      }
    }
  }
}

function reverseTrain(seg) {
  for (let train of train_list) {
    if (train.exists && train.stopped && train.rear_pos[0] === seg && train.front_pos[0] === seg) {
      train.orientation = opp_dir(train.orientation);
      [train.rear_pos[1], train.front_pos[1]] = [train.front_pos[1], train.rear_pos[1]];
    }
  } 
}

function readHmiInputs() {
  for (let train of train_list) {
    train.stopped = document.getElementById(train.hmi_stop_ID).checked;
  }
  for (let sw of switch_list) {
    sw.manual_control = document.getElementById(sw.hmi_manual_control).checked;
    sw.manual_left = document.getElementById(sw.hmi_manual_left).checked;
    sw.manual_right = document.getElementById(sw.hmi_manual_right).checked;
    if (sw.manual_left && sw.manual_right) {
      sw.manual_left = false;
      sw.manual_right = false;
    }
    sw.sensor_fail_left = document.getElementById(sw.hmi_sensor_fail_left).checked;
    sw.sensor_fail_right = document.getElementById(sw.hmi_sensor_fail_right).checked;
    sw.motor_fail = document.getElementById(sw.hmi_motor_fail).checked;
  }
  for (let route of route_list) {
    route.formation_command = document.getElementById(route.hmi_formation_ID).checked;
    route.destruction_command = document.getElementById(route.hmi_destruction_ID).checked;
    route.ignore_approach = document.getElementById(route.hmi_ignore_approach_ID).checked;
  }
  for (let signal of controllable_signal_list) {
    signal.close_command = document.getElementById(signal.hmi_close_ID).checked;
  }
}

function writeHmiOutputs() {
  for (let train of train_list) {
    train.draw();
  }
  for (let sw of switch_list) {
    if (sw.commanded_left) {
      document.getElementById(sw.hmi_command_left).setAttribute("fill", "yellow");
    } else {
      document.getElementById(sw.hmi_command_left).setAttribute("fill", "black");
    }
    if (sw.commanded_right) {
      document.getElementById(sw.hmi_command_right).setAttribute("fill", "yellow");
    } else {
      document.getElementById(sw.hmi_command_right).setAttribute("fill", "black");
    }
    if ((sw.commanded_left && !(sw.pos === "left")) || (sw.commanded_right && !(sw.pos === "right"))) {
      document.getElementById(sw.hmi_switch_moving).setAttribute("fill", "yellow");
    } else {
      document.getElementById(sw.hmi_switch_moving).setAttribute("fill", "black");
    }
    if (sw.pos === "left") {
      document.getElementById(sw.hmi_ID).setAttribute("x2", sw.hmi_pos[0][0]);
      document.getElementById(sw.hmi_ID).setAttribute("y2", sw.hmi_pos[0][1]);
    } else if (sw.pos === "right") {
      document.getElementById(sw.hmi_ID).setAttribute("x2", sw.hmi_pos[2][0]);
      document.getElementById(sw.hmi_ID).setAttribute("y2", sw.hmi_pos[2][1]);
    } else {
      document.getElementById(sw.hmi_ID).setAttribute("x2", sw.hmi_pos[1][0]);
      document.getElementById(sw.hmi_ID).setAttribute("y2", sw.hmi_pos[1][1]);
    }
  }
  for (let route of route_list) {
    if (route.opened) {
      document.getElementById(route.hmi_ID).style.stroke = "green";
    } else {
      document.getElementById(route.hmi_ID).style.stroke = "black";
    }
  }
  for (let signal of controllable_signal_list) {
    if (signal.opened) {
      document.getElementById(signal.hmi_ID).style.fill = "green";
    } else {
      document.getElementById(signal.hmi_ID).style.fill = "red";
    }
  }
  for (let TC of TC_map.values()) {
    if (TC.occupation_ignored) {
      document.getElementById(TC.hmi_ign_ID).style.stroke = "red";
      if (TC.occupied || TC.failed) {
        for (let hmi_ID of TC.hmi_occup_ID) {
          document.getElementById(hmi_ID).style.stroke = "#800000";
        }
      } else {
        for (let hmi_ID of TC.hmi_occup_ID) {
          document.getElementById(hmi_ID).style.stroke = "#808080";
        }
      }
    } else {
      document.getElementById(TC.hmi_ign_ID).style.stroke = "black";
      if (TC.occupied || TC.failed) {
        for (let hmi_ID of TC.hmi_occup_ID) {
          document.getElementById(hmi_ID).style.stroke = "red";
        }
      } else {
        for (let hmi_ID of TC.hmi_occup_ID) {
          document.getElementById(hmi_ID).style.stroke = "black";
        }
      }
    }
    if (TC.failed) {
      document.getElementById(TC.hmi_fail_ID).style.stroke = "red";
    } else {
      document.getElementById(TC.hmi_fail_ID).style.stroke = "black";
    }
  }
}

document.querySelector('#remove_trains').addEventListener('click', removeTrains);
const send_train_buttons = document.querySelectorAll('[data-buttontype="send_train"]');
send_train_buttons.forEach((button_elem) => {
  button_elem.addEventListener('click', () => {
    sendTrain(seg_map.get(button_elem.dataset.seg), button_elem.dataset.dir);
  });
});
const reverse_train_buttons = document.querySelectorAll('[data-buttontype="reverse_train"]');
reverse_train_buttons.forEach((button_elem) => {
  button_elem.addEventListener('click', () => {
    reverseTrain(seg_map.get(button_elem.dataset.seg));
  });
});
const failure_TC_buttons = document.querySelectorAll('[data-buttontype="failure_TC"]');
failure_TC_buttons.forEach((button_elem) => {
  button_elem.addEventListener('click', () => {
    failureTC(TC_map.get(button_elem.dataset.tc));
  });
});
const ignore_TC_buttons = document.querySelectorAll('[data-buttontype="ignore_TC"]');
ignore_TC_buttons.forEach((button_elem) => {
  button_elem.addEventListener('click', () => {
    ignoreOccupation(TC_map.get(button_elem.dataset.tc));
  });
});

// Connect to the WebSocket server
const ws = new WebSocket('ws://localhost:9960');

ws.binaryType = "arraybuffer";

// Connection opened
ws.onopen = () => {
  document.getElementById('Connexion_Light').style.fill = 'green';
  document.getElementById('Connexion_Text').textContent = 'Connected to server';
  
  let interval = setInterval(() => {
    mainLoop(ws);
  }, 40);
};

// Listen for messages
ws.onmessage = (event) => {
  output_vector = new Uint8Array(event.data);
};

// Handle errors
ws.onerror = (error) => {
  document.getElementById('Connexion_Text').textContent = 'Error: ' + error.message;
  document.getElementById('Connexion_Light').style.fill = 'red';
};

// Handle connection close
ws.onclose = () => {
  document.getElementById('Connexion_Text').textContent = 'Not connected';
  document.getElementById('Connexion_Light').style.fill = '#303030';
};

function mainLoop(websocket) {
  readPlcOutputs(output_vector);
  readHmiInputs();
  for (let sw of switch_list) {
    sw.update_pos();
  }
  for (let train of train_list) {
    if (train.exists && !train.error) {
      train.update_pos();
    }
  }
  for (let TC of TC_map.values()) {
    TC.update_occupation();
  }
  writeHmiOutputs();
  writePlcInputs(input_vector);
  websocket.send(input_buffer);
}


export {sendTrain, reverseTrain, failureTC, ignoreOccupation, removeTrains};
