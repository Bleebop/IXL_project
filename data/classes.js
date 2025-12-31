import {opp_dir, get_seg_point, check_coll} from "./functions_util.js";

class TrackCircuit {
  constructor(name, bit_index, true_TC, hmi_occup_ID, hmi_fail_ID, hmi_ign_ID) {
    this.name = name;
    this.bit_index = bit_index;
    this.true_TC = true_TC;
    this.hmi_occup_ID = hmi_occup_ID;
    this.hmi_fail_ID = hmi_fail_ID;
    this.hmi_ign_ID = hmi_ign_ID;
    this.failed = false;
    this.occupation_ignored = false;
    this.occupied = false;
    this.segments = [];
  }
  update_occupation() {
    let temp_occup = false;
    for (let seg of this.segments) {
      if (seg.partial_occup.length > 0) {
        temp_occup = true;
      }
    }
    this.occupied = temp_occup || this.failed;
  }
}

class Segment {
  constructor(name, TC, true_seg, frontier_seg, hmi_id, hmi_position) {
    this.name = name;
    this.TC = TC;
    this.true_seg = true_seg;
    this.frontier_seg = frontier_seg;
    this.hmi_id = hmi_id;
    this.hmi_position = hmi_position;
    this.partial_occup = [];
     
    if (TC != null) {
      TC.segments.push(this);
    }
  }
  
  exit_sig(dir) {
    if ((dir === "up") && Object.hasOwn(this, "exit_sig_up")) {
      return this.exit_sig_up;
    } else if ((dir === "down") && Object.hasOwn(this, "exit_sig_down")) {
      return this.exit_sig_down;
    } else {
      return null
    }
  }
  
  // TODO maybe parametrize for trailable switches
  next_seg(dir) {
    if (dir === "up") {
      if (Object.hasOwn(this, "switch_up")) {
        if (this.switch_up.pos === "left") {
          return this.next_seg_up_left;
        } else if (this.switch_up.pos === "right") {
          return this.next_seg_up_right;
        } else {
          return null
        }
      } else {
        return this.next_seg_up_left;
      }
    } else if (dir === "down") {
      if (Object.hasOwn(this, "switch_down")) {
        if (this.switch_down.pos === "left") {
          return this.next_seg_down_left;
        } else if (this.switch_down.pos === "right") {
          return this.next_seg_down_right;
        } else {
          return null
        }
      } else {
        return this.next_seg_down_left;
      }
    } else {
      return null
    }
  }
}

class Switch {
  constructor(name, pos, bit_index, true_switch, hmi_ID, hmi_pos, TC, tip_seg, left_seg, right_seg, hmi_command_left, hmi_command_right, hmi_switch_moving, hmi_manual_control, hmi_manual_left, hmi_manual_right, hmi_sensor_fail_left, hmi_sensor_fail_right, hmi_motor_fail, delay_to_int, delay_to_left, delay_to_right) {
    this.name = name;
    this.pos = pos;
    this.bit_index = bit_index;
    this.true_switch = true_switch;
    this.hmi_ID = hmi_ID;
    this.hmi_pos = hmi_pos;
    this.TC = TC;
    this.tip_seg = tip_seg;
    this.left_seg = left_seg;
    this.right_seg = right_seg;
    this.hmi_command_left = hmi_command_left;
    this.hmi_command_right = hmi_command_right;
    this.hmi_switch_moving = hmi_switch_moving;
    this.hmi_manual_control = hmi_manual_control;
    this.hmi_manual_left = hmi_manual_left;
    this.hmi_manual_right = hmi_manual_right;
    this.hmi_sensor_fail_left = hmi_sensor_fail_left;
    this.hmi_sensor_fail_right = hmi_sensor_fail_right;
    this.hmi_motor_fail = hmi_motor_fail;
    this.commanded_left = false;
    this.commanded_right = false;
    this.manual_control = false;
    this.manual_left = false;
    this.manual_right = false;
    this.sensor_fail_left = false;
    this.sensor_fail_right = false;
    this.motor_fail = false;
    this.delay_to_int = delay_to_int;
    this.delay_to_left = delay_to_left;
    this.delay_to_right = delay_to_right;
    this.timer_move = false;
  }
  
  update_pos() {
    if
     (  (!this.motor_fail && !this.manual_control && this.commanded_left)
     || (this.manual_control && this.manual_left)
     ) {
      if (this.pos === "right") {
        if (!this.timer_move) {
          this.timer_move = true;
          this.move_timeOut = setTimeout(() => {this.move_to("intermediate");}, this.delay_to_int);
        }
      } else if (this.pos === "intermediate") {
        if (!this.timer_move) {
          this.timer_move = true;
          this.move_timeOut = setTimeout(() => {this.move_to("left");}, this.delay_to_left);
        }
      }
    } else if
     (  (!this.motor_fail && !this.manual_control && this.commanded_right)
     || (this.manual_control && this.manual_right)
     ) {
      if (this.pos === "left") {
        if (!this.timer_move) {
          this.timer_move = true;
          this.move_timeOut = setTimeout(() => {this.move_to("intermediate");}, this.delay_to_int);
        }
      } else if (this.pos === "intermediate") {
        if (!this.timer_move) {
          this.timer_move = true;
          this.move_timeOut = setTimeout(() => {this.move_to("right");}, this.delay_to_right);
        }
      }
    } else {
      this.timer_move = false;
      clearTimeout(this.move_timeOut);
    }
  }
  
  move_to(new_pos) {
    clearTimeout(this.move_timeOut);
    this.pos = new_pos;
    this.timer_move = false;
  }
}

class Route {
  constructor(name, bit_index, true_route, hmi_ID, hmi_formation_ID, hmi_destruction_ID, hmi_ignore_approach_ID) {
    this.name = name;
    this.bit_index = bit_index;
    this.true_route = true_route;
    this.hmi_ID = hmi_ID;
    this.hmi_formation_ID = hmi_formation_ID;
    this.hmi_destruction_ID = hmi_destruction_ID;
    this.hmi_ignore_approach_ID = hmi_ignore_approach_ID;
    this.formation_command = false;
    this.destruction_command = false;
    this.ignore_approach = false;
    this.opened = false;
  }
}

class Signal {
  constructor(name, always_closed, bit_index, true_signal, hmi_ID, hmi_close_ID, prev_seg, dir) {
    this.name = name;
    this.always_closed = always_closed;
    this.bit_index = bit_index;
    this.true_signal = true_signal;
    this.hmi_ID = hmi_ID;
    this.hmi_close_ID = hmi_close_ID;
    this.close_command = false;
    this.opened = false;
    this.prev_seg = prev_seg;
    this.dir = dir;
    if (dir === "up") {
      prev_seg.exit_sig_up = this;
    } else if (dir === "down") {
      prev_seg.exit_sig_down = this;
    }
  }
}

class Train {
  constructor(name, color, hmi_ID, hmi_stop_ID, hmi_error_id, delay_move) {
    this.name = name;
    this.color = color;
    this.hmi_ID = hmi_ID;
    this.hmi_stop_ID = hmi_stop_ID;
    this.hmi_error_id = hmi_error_id;
    this.exists = false;
    this.rear_pos = [null, -1];
    this.front_pos = [null, -1];
    this.orientation = "NA";
    this.stopped = false;
    this.error = false;
    this.delay_move = delay_move;
    
    this.timer_move = false;
  }
  
  update_pos() {
    let waiting_for_signal;
    let sig_in_front = this.front_pos[0].exit_sig(this.orientation);
    waiting_for_signal = (  (this.rear_pos[0] === this.front_pos[0])
                         && !(sig_in_front == null)
                         && (sig_in_front.always_closed || !sig_in_front.opened)
                         );
    let waiting_for_other_train;
    let next_rear_pos;
    let next_front_pos;
    let next_rear_dir;
    let next_pos_dir;
    let next_front_dir;
    let next_segment;
    let next_intervals = [[],[]];
    if (this.rear_pos[0] === this.front_pos[0]) {
      next_pos_dir = this.front_pos[0].next_seg(this.orientation);
      if (next_pos_dir == null) {
        this.error = true;
      } else {
        [next_segment, next_front_dir] = next_pos_dir
        if (next_front_dir === "up") {
          next_front_pos = [next_segment, 0.45];
          next_intervals[1] = [this, 0, 0.45];
        } else {
          next_front_pos = [next_segment, 0.55];
          next_intervals[1] = [this, 0.55, 1];
        }
        next_rear_dir = this.orientation;
        if (next_rear_dir === "up") {
          next_rear_pos = [this.front_pos[0], 0.55];
          next_intervals[0] = [this, 0.55, 1];
        } else {
          next_rear_pos = [this.front_pos[0], 0.45];
          next_intervals[0] = [this, 0, 0.45];
        }
      }
    } else {
      next_rear_dir = this.orientation;
      next_front_dir = this.orientation;
      next_intervals[1] = [this, 0, 1];
      if (this.orientation === "up") {
        next_front_pos = [this.front_pos[0], 1];
        next_rear_pos = [this.front_pos[0], 0];
      } else {
        next_front_pos = [this.front_pos[0], 0];
        next_rear_pos = [this.front_pos[0], 1];
      }
    }
    waiting_for_other_train = check_coll(next_intervals[1], next_front_pos[0].partial_occup);
    
    if (this.exists && !this.stopped && !waiting_for_signal && !waiting_for_other_train) {
      if (!this.timer_move) {
        this.timer_move = true;
        this.move_timeOut = setTimeout(
          () => {
            this.move([next_rear_pos, next_front_pos, next_front_dir], next_intervals);
          },
          this.delay_move
        );
      }
    } else if (this.timer_move) {
      this.timer_move = false;
      clearTimeout(this.move_timeOut);
    }
  }
  
  move(next_pos, next_intervals) {
    clearTimeout(this.move_timeOut);
    this.timer_move = false;
    let new_occup_rear = [];
    let new_occup_front = [];
    for (let rear_seg_inter of this.rear_pos[0].partial_occup) {
      if (!(rear_seg_inter[0] === this)) {
        new_occup_rear.push(rear_seg_inter);
      }
    }
    for (let front_seg_inter of this.front_pos[0].partial_occup) {
      if (!(front_seg_inter[0] === this)) {
        new_occup_front.push(front_seg_inter);
      }
    }
    this.rear_pos[0].partial_occup = new_occup_rear;
    this.front_pos[0].partial_occup = new_occup_front;
    if (  (next_pos[0][0] === next_pos[1][0])
       && (next_pos[0][0].frontier_seg)) {
    // Train is leaving the area
      this.exists = false;
      this.rear_pos = [null, -1];
      this.front_pos = [null, -1];
      this.orientation = "NA";
      this.error = false;
    } else {
      if (!(next_intervals[0].length == 0)) {
        next_pos[0][0].partial_occup.push(next_intervals[0]);
      }
      next_pos[1][0].partial_occup.push(next_intervals[1]);
      this.rear_pos = next_pos[0];
      this.front_pos = next_pos[1];
      this.orientation = next_pos[2];
    }
  }
  
  draw() {
    let points = [[0,0],[0,0],[0,0],[0,0],[0,0]];
    if (this.error) {
      document.getElementById(this.hmi_error_id).innerHTML = this.name+" KO";
      document.getElementById(this.hmi_error_id).style.backgroundColor = "red";
      document.getElementById(this.hmi_ID).style.fill = "red";
    } else if (this.exists) {
      document.getElementById(this.hmi_error_id).innerHTML = this.name+" OK";
      document.getElementById(this.hmi_error_id).style.backgroundColor = "#f1f1f1";
      document.getElementById(this.hmi_ID).style.fill = "none";
      document.getElementById(this.hmi_ID).setAttribute("visibility", "visible");
      if (this.rear_pos[0] === this.front_pos[0]) {
        if (this.orientation === "up") { //TODO fragile
          points[0] = this.rear_pos[0].hmi_position[0];
          points[1] = this.rear_pos[0].hmi_position[1];
        } else {
          points[0] = this.rear_pos[0].hmi_position[1];
          points[1] = this.rear_pos[0].hmi_position[0];
        }
      } else {
        points[0] = get_seg_point(this.rear_pos[0].hmi_position, this.rear_pos[1]);
        points[1] = get_seg_point(this.front_pos[0].hmi_position, this.front_pos[1]);
      }
      if (!(points[0] === points[1])) {
        const base_x = points[1][0]-points[0][0];
        const base_y = points[1][1]-points[0][1];
        const base_norm = Math.sqrt(base_x*base_x+base_y*base_y);
        const v_b = [base_x/base_norm, base_y/base_norm];
        const v_ort = [v_b[1], -v_b[0]];
        points[0] = [points[0][0]+5*v_ort[0], points[0][1]+5*v_ort[1]];
        points[1] = [points[1][0]+5*v_ort[0], points[1][1]+5*v_ort[1]];
        points[2] = [points[1][0]+10*v_ort[0], points[1][1]+10*v_ort[1]];
        points[3] = [points[2][0]+10*v_ort[0]-5*v_b[0], points[2][1]+10*v_ort[1]-5*v_b[1]];
        points[4] = [points[0][0]+20*v_ort[0], points[0][1]+20*v_ort[1]];
        let pts_str = points[0].toString()+" "+points[1].toString()+" "+points[2].toString()+" "+points[3].toString()+" "+points[4].toString()+" "+points[0].toString();
        document.getElementById(this.hmi_ID).setAttribute("points", pts_str);
      }
    } else {
      document.getElementById(this.hmi_ID).setAttribute("visibility", "hidden");
    }
  }
}

export {TrackCircuit, Segment, Switch, Route, Signal, Train};
