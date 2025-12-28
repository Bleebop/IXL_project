/*
PLC Inputs :
  octet 0 : TC occupation (101->108)         (TC)      (true = occupied)
  octet 1 : TC occupation (109->116)         (TC)      
  octet 2 : Switch detected Left             (Switch)  (true = detection)
  octet 3 : Switch detected Right            (Switch)  
  octet 4 : Switch manual override           (Switch)  (true = manual control)
  octet 5 : Force signal closing             (Signal)  (true = force closing)
  octet 6 : Ignore TC occupation (101->108)  (TC)      (true = ignore occupation)
  octet 7 : Ignore TC occupation (109->116)  (TC)      
  octet 8 : Ignore approach                  (Route)   (true = ignore approach)
  octet 9 : Route formation demand           (Route)   (true = formation demand active)
  octet 10: Route destruction demand         (Route)   (true = destruction demand active)

PLC Outputs :
  octet 0 : Route state          (Route)   (true = route opened)
  octet 1 : Signal open          (Signal)  (true = signal opened)
  octet 2 : Switch command Left  (Switch)  (true = switch commanded)
  octet 3 : Switch command Right (Switch)

Enums :
  TC :
    TC_101 := 1,
    TC_102 := 2,
    TC_103 := 3,
    TC_104 := 4,
    TC_105 := 5,
    TC_106 := 6,
    TC_107 := 7,
    TC_108 := 8,
    TC_109 := 9,
    TC_110 := 10,
    TC_111 := 11,
    TC_112 := 12,
    TC_113 := 13,
    TC_114 := 14,
    TC_115 := 15,
    TC_116 := 16,
    
  Switches :
    Sw_01 := 1,
    Sw_02 := 2,
  
  Signals :
    Sig_201 := 1,
    Sig_203 := 2,
    Sig_205 := 3,
    Sig_206 := 4,
    Sig_208 := 5,
  
  Routes :
    AB := 1,
    BC := 2,
    ED := 3,
    CD := 4,
    DC := 5,
    CB := 6,
*/

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
    
    TC.segments.push(this);
  }
  
  exit_sig(dir) {
    if ((dir === "up") && Object.hasOwn(this, "exit_sig_up")) {
      return this.exit_sig_up;
    } else if ((dir === "down") && Object.hasOwn(this, "exit_sig_down")) {
      return this.exit_sig_down;
    } else {
      return undefined
    }
  }
  // TODO maybe : include next_seg as a method
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
    this.rear_pos = [seg_nil, -1];
    this.front_pos = [seg_nil, -1];
    this.orientation = "NA";
    this.stopped = false;
    this.error = false;
    this.delay_move = delay_move;
    
    this.timer_move = false;
  }
  
  update_pos(switch_set) {
    let waiting_for_signal;
    let sig_in_front = this.front_pos[0].exit_sig(this.orientation);
    waiting_for_signal = (  (this.rear_pos[0] === this.front_pos[0])
                         && !(sig_in_front === undefined)
                         && (sig_in_front.always_closed || !sig_in_front.opened)
                         );
    let waiting_for_other_train;
    let next_rear_pos;
    let next_front_pos;
    let next_rear_dir;
    let next_front_dir;
    let next_seg;
    let next_intervals = [[],[]];
    if (this.rear_pos[0] === this.front_pos[0]) {
      [next_seg, next_front_dir] = nextSeg(this.front_pos[0], this.orientation, switch_set);
      if (next_front_dir === "up") {
        next_front_pos = [next_seg, 0.45];
        next_intervals[1] = [this, 0, 0.45];
      } else {
        next_front_pos = [next_seg, 0.55];
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
      this.rear_pos = [seg_nil, -1];
      this.front_pos = [seg_nil, -1];
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

const n_true_TC = 16;
const n_border_TC = 4;

const TC_nil = new TrackCircuit("TC_nil", -1, false, ["hmi_seg_nil"], "hmi_TC_nil_fail", "hmi_TC_nil_ign");
const TC_101 = new TrackCircuit("TC_101",  0, true , ["hmi_seg_101"], "hmi_TC_101_fail", "hmi_TC_101_ign");
const TC_102 = new TrackCircuit("TC_102",  1, true , ["hmi_seg_102"], "hmi_TC_102_fail", "hmi_TC_102_ign");
const TC_103 = new TrackCircuit("TC_103",  2, true , ["hmi_seg_103"], "hmi_TC_103_fail", "hmi_TC_103_ign");
const TC_104 = new TrackCircuit("TC_104",  3, true , ["hmi_seg_104"], "hmi_TC_104_fail", "hmi_TC_104_ign");
const TC_105 = new TrackCircuit("TC_105",  4, true , ["hmi_seg_105"], "hmi_TC_105_fail", "hmi_TC_105_ign");
const TC_106 = new TrackCircuit("TC_106",  5, true , ["hmi_seg_106"], "hmi_TC_106_fail", "hmi_TC_106_ign");
const TC_107 = new TrackCircuit("TC_107",  6, true , ["hmi_seg_107"], "hmi_TC_107_fail", "hmi_TC_107_ign");
const TC_108 = new TrackCircuit("TC_108",  7, true , ["hmi_seg_108"], "hmi_TC_108_fail", "hmi_TC_108_ign");
const TC_109 = new TrackCircuit("TC_109",  8, true , ["hmi_seg_109_t", "hmi_seg_109_l", "hmi_seg_109_r", "hmi_seg_109_sw"], "hmi_TC_109_fail", "hmi_TC_109_ign");
const TC_110 = new TrackCircuit("TC_110",  9, true , ["hmi_seg_110_t", "hmi_seg_110_l", "hmi_seg_110_r", "hmi_seg_110_sw"], "hmi_TC_110_fail", "hmi_TC_110_ign");
const TC_111 = new TrackCircuit("TC_111", 10, true , ["hmi_seg_111"], "hmi_TC_111_fail", "hmi_TC_111_ign");
const TC_112 = new TrackCircuit("TC_112", 11, true , ["hmi_seg_112"], "hmi_TC_112_fail", "hmi_TC_112_ign");
const TC_113 = new TrackCircuit("TC_113", 12, true , ["hmi_seg_113"], "hmi_TC_113_fail", "hmi_TC_113_ign");
const TC_114 = new TrackCircuit("TC_114", 13, true , ["hmi_seg_114"], "hmi_TC_114_fail", "hmi_TC_114_ign");
const TC_115 = new TrackCircuit("TC_115", 14, true , ["hmi_seg_115"], "hmi_TC_115_fail", "hmi_TC_115_ign");
const TC_116 = new TrackCircuit("TC_116", 15, true , ["hmi_seg_116"], "hmi_TC_116_fail", "hmi_TC_116_ign");
const TC_99  = new TrackCircuit("TC_99" , -1, false, ["hmi_seg_nil"], "hmi_TC_nil_fail", "hmi_TC_nil_ign");
const TC_117 = new TrackCircuit("TC_117", -1, false, ["hmi_seg_nil"], "hmi_TC_nil_fail", "hmi_TC_nil_ign");
const TC_100 = new TrackCircuit("TC_100", -1, false, ["hmi_seg_nil"], "hmi_TC_nil_fail", "hmi_TC_nil_ign");
const TC_118 = new TrackCircuit("TC_118", -1, false, ["hmi_seg_nil"], "hmi_TC_nil_fail", "hmi_TC_nil_ign");

const true_TC_set = {
  TC_101 : TC_101,
  TC_102 : TC_102,
  TC_103 : TC_103,
  TC_104 : TC_104,
  TC_105 : TC_105,
  TC_106 : TC_106,
  TC_107 : TC_107,
  TC_108 : TC_108,
  TC_109 : TC_109,
  TC_110 : TC_110,
  TC_111 : TC_111,
  TC_112 : TC_112,
  TC_113 : TC_113,
  TC_114 : TC_114,
  TC_115 : TC_115,
  TC_116 : TC_116
};
const all_TC_set = {
  TC_nil : TC_nil,
  TC_101 : TC_101,
  TC_102 : TC_102,
  TC_103 : TC_103,
  TC_104 : TC_104,
  TC_105 : TC_105,
  TC_106 : TC_106,
  TC_107 : TC_107,
  TC_108 : TC_108,
  TC_109 : TC_109,
  TC_110 : TC_110,
  TC_111 : TC_111,
  TC_112 : TC_112,
  TC_113 : TC_113,
  TC_114 : TC_114,
  TC_115 : TC_115,
  TC_116 : TC_116,
  TC_99  : TC_99 ,
  TC_100 : TC_100,
  TC_117 : TC_117,
  TC_118 : TC_118
};

const n_true_seg = 20;
const n_border_seg = 4;

const seg_nil   = new Segment("seg_nil"  , TC_nil, false, false, "hmi_seg_nil"  , [[-1,-1],[-1,-1]]);
const seg_101   = new Segment("seg_101"  , TC_101, true , false, "hmi_seg_101"  , [[100,220],[180,220]]);
const seg_102   = new Segment("seg_102"  , TC_102, true , false, "hmi_seg_102"  , [[100,100],[180,100]]);
const seg_103   = new Segment("seg_103"  , TC_103, true , false, "hmi_seg_103"  , [[200,220],[280,220]]);
const seg_104   = new Segment("seg_104"  , TC_104, true , false, "hmi_seg_104"  , [[200,100],[280,100]]);
const seg_105   = new Segment("seg_105"  , TC_105, true , false, "hmi_seg_105"  , [[300,220],[380,220]]);
const seg_106   = new Segment("seg_106"  , TC_106, true , false, "hmi_seg_106"  , [[300,100],[380,100]]);
const seg_107   = new Segment("seg_107"  , TC_107, true , false, "hmi_seg_107"  , [[400,220],[480,220]]);
const seg_108   = new Segment("seg_108"  , TC_108, true , false, "hmi_seg_108"  , [[400,100],[480,100]]);
const seg_109_t = new Segment("seg_109_t", TC_109, true , false, "hmi_seg_109_t", [[630,220],[680,220]]);
const seg_109_l = new Segment("seg_109_l", TC_109, true , false, "hmi_seg_109_l", [[500,220],[610,220]]);
const seg_109_r = new Segment("seg_109_r", TC_109, true , false, "hmi_seg_109_r", [[590,165],[615,205]]);
const seg_110_t = new Segment("seg_110_t", TC_110, true , false, "hmi_seg_110_t", [[500,100],[550,100]]);
const seg_110_l = new Segment("seg_110_l", TC_110, true , false, "hmi_seg_110_l", [[570,100],[680,100]]);
const seg_110_r = new Segment("seg_110_r", TC_110, true , false, "hmi_seg_110_r", [[560,115],[580,150]]);
const seg_111   = new Segment("seg_111"  , TC_111, true , false, "hmi_seg_111"  , [[700,220],[780,220]]);
const seg_112   = new Segment("seg_112"  , TC_112, true , false, "hmi_seg_112"  , [[700,100],[780,100]]);
const seg_113   = new Segment("seg_113"  , TC_113, true , false, "hmi_seg_113"  , [[800,220],[880,220]]);
const seg_114   = new Segment("seg_114"  , TC_114, true , false, "hmi_seg_114"  , [[800,100],[880,100]]);
const seg_115   = new Segment("seg_115"  , TC_115, true , false, "hmi_seg_115"  , [[900,220],[980,220]]);
const seg_116   = new Segment("seg_116"  , TC_116, true , false, "hmi_seg_116"  , [[900,100],[980,100]]);
const seg_99    = new Segment("seg_99"   , TC_99 , false, true , "hmi_seg_nil"  , [[0,220],[80,220]]);
const seg_100   = new Segment("seg_100"  , TC_100, false, true , "hmi_seg_nil"  , [[0,100],[80,100]]);
const seg_117   = new Segment("seg_117"  , TC_117, false, true , "hmi_seg_nil"  , [[1000,220],[1080,220]]);
const seg_118   = new Segment("seg_118"  , TC_118, false, true , "hmi_seg_nil"  , [[1000,100],[1080,100]]);

const true_seg_set = {
  seg_101 : seg_101,
  seg_102 : seg_102,
  seg_103 : seg_103,
  seg_104 : seg_104,
  seg_105 : seg_105,
  seg_106 : seg_106,
  seg_107 : seg_107,
  seg_108 : seg_108,
  seg_109_t : seg_109_t,
  seg_109_l : seg_109_l,
  seg_109_r : seg_109_r,
  seg_110_t : seg_110_t,
  seg_110_l : seg_110_l,
  seg_110_r : seg_110_r,
  seg_111 : seg_111,
  seg_112 : seg_112,
  seg_113 : seg_113,
  seg_114 : seg_114,
  seg_115 : seg_115,
  seg_116 : seg_116
};
const all_seg_set = {
  seg_nil : seg_nil,
  seg_101 : seg_101,
  seg_102 : seg_102,
  seg_103 : seg_103,
  seg_104 : seg_104,
  seg_105 : seg_105,
  seg_106 : seg_106,
  seg_107 : seg_107,
  seg_108 : seg_108,
  seg_109_t : seg_109_t,
  seg_109_l : seg_109_l,
  seg_109_r : seg_109_r,
  seg_110_t : seg_110_t,
  seg_110_l : seg_110_l,
  seg_110_r : seg_110_r,
  seg_111 : seg_111,
  seg_112 : seg_112,
  seg_113 : seg_113,
  seg_114 : seg_114,
  seg_115 : seg_115,
  seg_116 : seg_116,
  seg_99  : seg_99 ,
  seg_100 : seg_100,
  seg_117 : seg_117,
  seg_118 : seg_118
};

const n_switch = 2;
const sw_01 = new Switch(
  "sw_01", "left", 0, true, "hmi_seg_110_sw", [[570, 100],[565, 107],[560, 115]],
  TC_110, seg_110_t, seg_110_l, seg_110_r,
  "Command_Left_Sw_01", "Command_Right_Sw_01", "Switch_Moving_Sw_01", "MC_Sw_01", "ML_Sw_01", "MR_Sw_01", "SF_L_Sw_01", "SF_R_Sw_01", "MF_Sw_01",
  500, 1000, 1000
);
const sw_02 = new Switch(
  "sw_02", "left", 1, true, "hmi_seg_109_sw", [[610, 220],[612, 212],[615, 205]],
  TC_109, seg_109_t, seg_109_l, seg_109_r,
  "Command_Left_Sw_02", "Command_Right_Sw_02", "Switch_Moving_Sw_02", "MC_Sw_02", "ML_Sw_02", "MR_Sw_02", "SF_L_Sw_02", "SF_R_Sw_02", "MF_Sw_02",
  500, 1000, 1000
);
const sw_nil = new Switch(
  "", "", -1, false, "", [[0, 0],[0, 0],[0, 0]],
  TC_nil, seg_nil, seg_nil, seg_nil,
  "", "", "", "", "", "", "",
  -1, -1, -1
);
const true_switch_set = {
  sw_01 : sw_01,
  sw_02 : sw_02
};
const all_switch_set = {
  sw_nil : sw_nil,
  sw_01 : sw_01,
  sw_02 : sw_02
};

const n_true_route = 6
const n_static_route = 4
const route_nil = new Route("NIL", -1, false, "", "", "", "");
const route_AB = new Route("AB", 0, true, "hmi_route_AB", "routeFormation_route_AB", "routeDestruction_route_AB", "ignoreApproach_route_AB");
const route_BC = new Route("BC", 1, true, "hmi_route_BC", "routeFormation_route_BC", "routeDestruction_route_BC", "ignoreApproach_route_BC");
const route_ED = new Route("ED", 2, true, "hmi_route_ED", "routeFormation_route_ED", "routeDestruction_route_ED", "ignoreApproach_route_ED");
const route_CD = new Route("CD", 3, true, "hmi_route_CD", "routeFormation_route_CD", "routeDestruction_route_CD", "ignoreApproach_route_CD");
const route_DC = new Route("DC", 4, true, "hmi_route_DC", "routeFormation_route_DC", "routeDestruction_route_DC", "ignoreApproach_route_DC");
const route_CB = new Route("CB", 5, true, "hmi_route_CB", "routeFormation_route_CB", "routeDestruction_route_CB", "ignoreApproach_route_CB");
const route_C_EXT_UP = new Route("C_EXT_UP", -1, false, "", "", "", "");
const route_D_EXT_DOWN = new Route("D_EXT_DOWN", -1, false, "", "", "", "");
const route_A_EXT_UP = new Route("A_EXT_UP", -1, false, "", "", "", "");
const route_E_EXT_DOWN = new Route("E_EXT_DOWN", -1, false, "", "", "", "");
const true_route_set = {
  route_AB : route_AB,
  route_BC : route_BC,
  route_ED : route_ED,
  route_CD : route_CD,
  route_DC : route_DC,
  route_CB : route_CB
};
const all_route_set = {
  route_nil : route_nil,
  route_AB : route_AB,
  route_BC : route_BC,
  route_ED : route_ED,
  route_CD : route_CD,
  route_DC : route_DC,
  route_CB : route_CB,
  route_C_EXT_UP : route_C_EXT_UP,
  route_D_EXT_DOWN : route_D_EXT_DOWN,
  route_A_EXT_UP : route_A_EXT_UP,
  route_E_EXT_DOWN : route_E_EXT_DOWN,
};

const n_true_signal = 5
const n_static_signal = 1
const signal_nil = new Signal("sig_nil", false, -1, false, "", "");
const signal_201 = new Signal("sig_201", false, 0, true, "hmi_sig_201", "closeSignal_201", seg_103, "up");
const signal_203 = new Signal("sig_203", false, 1, true, "hmi_sig_203", "closeSignal_203", seg_107, "up");
const signal_205 = new Signal("sig_205", false, 2, true, "hmi_sig_205", "closeSignal_205", seg_108, "up");
const signal_206 = new Signal("sig_206", false, 3, true, "hmi_sig_206", "closeSignal_206", seg_111, "down");
const signal_208 = new Signal("sig_208", false, 4, true, "hmi_sig_208", "closeSignal_208", seg_112, "down");
const perm_stop_02 = new Signal("PS_02", true, -1, true, "", "", seg_107, "down");

const commanded_signal_set = {
  signal_201 : signal_201,
  signal_203 : signal_203,
  signal_205 : signal_205,
  signal_206 : signal_206,
  signal_208 : signal_208
};
const true_signal_set = {
  signal_201 : signal_201,
  signal_203 : signal_203,
  signal_205 : signal_205,
  signal_206 : signal_206,
  signal_208 : signal_208,
  perm_stop_02 : perm_stop_02
};
const all_signal_set = {
  signal_nil : signal_nil,
  signal_201 : signal_201,
  signal_203 : signal_203,
  signal_205 : signal_205,
  signal_206 : signal_206,
  signal_208 : signal_208,
  perm_stop_02 : perm_stop_02
};
const train_1 = new Train("Train 1", "#FF0000", "hmi_train_1", "Stop_Train_T1", "Train_Error_T1", 1000);
const train_2 = new Train("Train 2", "#00FF00", "hmi_train_2", "Stop_Train_T2", "Train_Error_T2", 1000);
const train_3 = new Train("Train 3", "#0000FF", "hmi_train_3", "Stop_Train_T3", "Train_Error_T3", 1000);
const train_4 = new Train("Train 4", "#FFFF00", "hmi_train_4", "Stop_Train_T4", "Train_Error_T4", 1000);
const train_5 = new Train("Train 5", "#FF00FF", "hmi_train_5", "Stop_Train_T5", "Train_Error_T5", 1000);
const train_6 = new Train("Train 6", "#00FFFF", "hmi_train_6", "Stop_Train_T6", "Train_Error_T6", 1000);
const train_list = [train_1, train_2, train_3, train_4, train_5, train_6];


function nextSeg(seg, dir, sw_set) {
  if (dir == "up") {
    switch(seg) {
      case seg_nil:
        return [seg_nil, "NA"];
      case seg_101:
        return [seg_103, "up"];
      case seg_102:
        return [seg_104, "up"];
      case seg_103:
        return [seg_105, "up"];
      case seg_104:
        return [seg_106, "up"];
      case seg_105:
        return [seg_107, "up"];
      case seg_106:
        return [seg_108, "up"];
      case seg_107:
        return [seg_109_l, "up"];
      case seg_108:
        return [seg_110_t, "up"];
        
      case seg_109_t:
        return [seg_111, "up"];
      case seg_109_l:
        if (sw_set.sw_02.pos == "left") {
          return [seg_109_t, "up"];
        } else {
          return [seg_nil, "NA"]; // TODO maybe parametrize for trailable switches
        }
      case seg_109_r:
        if (sw_set.sw_02.pos == "right") {
          return [seg_109_t, "up"];
        } else {
          return [seg_nil, "NA"]; // TODO maybe parametrize for trailable switches
        }
        
      case seg_110_t:
        if (sw_set.sw_01.pos == "left") {
          return [seg_110_l, "up"];
        } else if (sw_set.sw_01.pos == "right") {
          return [seg_110_r, "up"];
        } else {
          return [seg_nil, "NA"];
        }
      case seg_110_l:
        return [seg_112, "up"];
      case seg_110_r:
        return [seg_109_r, "up"];
        
      case seg_111:
        return [seg_113, "up"];
      case seg_112:
        return [seg_114, "up"];
      case seg_113:
        return [seg_115, "up"];
      case seg_114:
        return [seg_116, "up"];
      case seg_115:
        return [seg_117, "up"];
      case seg_116:
        return [seg_118, "up"];
        
      case seg_99:
        return [seg_101, "up"];
      case seg_100:
        return [seg_102, "up"];
      case seg_117:
        return [seg_nil, "NA"];
      case seg_118:
        return [seg_nil, "NA"];
    }
  } else if (dir == "down") {
    switch(seg) {
      case seg_nil:
        return [seg_nil, "NA"];
      case seg_101:
        return [seg_99, "down"];
      case seg_102:
        return [seg_100, "down"];
      case seg_103:
        return [seg_101, "down"];
      case seg_104:
        return [seg_102, "down"];
      case seg_105:
        return [seg_103, "down"];
      case seg_106:
        return [seg_104, "down"];
      case seg_107:
        return [seg_105, "down"];
      case seg_108:
        return [seg_106, "down"];
        
      case seg_109_t:
        if (sw_set.sw_02.pos == "left") {
          return [seg_109_l, "down"];
        } else if (sw_set.sw_02.pos == "right") {
          return [seg_109_r, "down"];
        } else {
          return [seg_nil, "NA"];
        }
      case seg_109_l:
        return [seg_107, "down"];
      case seg_109_r:
        return [seg_110_r, "down"];
        
      case seg_110_t:
        return [seg_108, "down"];
      case seg_110_l:
        if (sw_set.sw_01.pos == "left") {
          return [seg_110_t, "down"];
        } else {
          return [seg_nil, "NA"]; // TODO maybe parametrize for trailable switches
        }
      case seg_110_r:
        if (sw_set.sw_01.pos == "right") {
          return [seg_110_t, "down"];
        } else {
          return [seg_nil, "NA"]; // TODO maybe parametrize for trailable switches
        }
        
      case seg_111:
        return [seg_109_t, "down"];
      case seg_112:
        return [seg_110_l, "down"];
      case seg_113:
        return [seg_111, "down"];
      case seg_114:
        return [seg_112, "down"];
      case seg_115:
        return [seg_113, "down"];
      case seg_116:
        return [seg_114, "down"];
        
      case seg_99:
        return [seg_nil, "down"];
      case seg_100:
        return [seg_nil, "down"];
      case seg_117:
        return [seg_115, "down"];
      case seg_118:
        return [seg_116, "down"];
    }
  } else {
    return [seg_nil, "NA"];
  }
}

function opp_dir(dir) {
  if (dir === "up") {
    return "down"
  } else if (dir === "down") {
    return "up"
  } else {
    return "NA"
  }
}

function get_seg_point(xy_points, frac) {
  return [((1-frac)*xy_points[0][0]+frac*xy_points[1][0]), ((1-frac)*xy_points[0][1]+frac*xy_points[1][1])]
}


const PLC_output_size = 4;
const PLC_input_size = 11;
let output_vector;
const input_buffer = new ArrayBuffer(PLC_input_size);
const input_vector = new Uint8Array(input_buffer);

const TC_occupation_octet = 0;
const Switch_detected_left_octet = 2;
const Switch_detected_right_octet = 3;
const Switch_manual_override_octet = 4;
const Force_signal_closing_octet = 5;
const Ignore_TC_occupation_octet = 6;
const Ignore_approach_octet = 8;
const Route_formation_demand_octet = 9;
const Route_destruction_demand_octet = 10;

const Route_state_octet = 0;
const Signal_open_octet = 1;
const Switch_command_left_octet = 2;
const Switch_command_right_octet = 3;

function intToBits(oct_int) {
  let remainder = oct_int;
  const res = [false, false, false, false, false, false, false, false];
  for (let i = 0; i < 8; i++) {
    res[i] = Boolean(remainder % 2);
    remainder = remainder >> 1;
  }
  return res;
}

function bitsToInt(oct_arr) {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    if (oct_arr[i]) {
      sum += 2**i;
    }
  }
  return sum;
}

function getBitArray(uint_array) {
  const oct_arr = new Array(uint_array.length);
  for (let i = 0; i < uint_array.length; i++) {
    let remainder = uint_array[i];
    oct_arr[i] = [false, false, false, false, false, false, false, false];
    for (let j = 0; j < 8; j++) {
      oct_arr[i][j] = Boolean(remainder % 2);
      remainder = remainder >> 1;
    }
  }
  return oct_arr;
}

function getUintArray(oct_array, uint_array) {
  for (let i = 0; i < oct_array.length; i++) {
    let sum = 0;
    for (let j = 0; j < 8; j++) {
      if (oct_array[i][j]) {
        sum += 2**j;
      }
    }
    uint_array[i] = sum;
  }
}

function readPlcOutputs() {
  const PLC_out_bit_arr = getBitArray(output_vector);
  for (let sw_n in true_switch_set) {
    let sw = true_switch_set[sw_n];
    let sw_octet = Math.floor(sw.bit_index/8);
    let sw_bit = sw.bit_index % 8;
    sw.commanded_left = PLC_out_bit_arr[Switch_command_left_octet + sw_octet][sw_bit];
    sw.commanded_right = PLC_out_bit_arr[Switch_command_right_octet + sw_octet][sw_bit];
  }
  for (let route_n in true_route_set) {
    let route = true_route_set[route_n];
    let route_octet = Math.floor(route.bit_index/8);
    let route_bit = route.bit_index % 8;
    route.opened = PLC_out_bit_arr[Route_state_octet + route_octet][route_bit];
  }
  for (let signal_n in commanded_signal_set) {
    let signal = commanded_signal_set[signal_n];
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
  for (let sw_n in true_switch_set) {
    let sw = true_switch_set[sw_n];
    let sw_octet = Math.floor(sw.bit_index/8);
    let sw_bit = sw.bit_index % 8;
    let detected_left = (sw.pos === "left") && !sw.sensor_fail_left;
    let detected_right = (sw.pos === "right") && !sw.sensor_fail_right;
    PLC_in_bit_arr[Switch_detected_left_octet + sw_octet][sw_bit] = detected_left;
    PLC_in_bit_arr[Switch_detected_right_octet + sw_octet][sw_bit] = detected_right;
    PLC_in_bit_arr[Switch_manual_override_octet + sw_octet][sw_bit] = sw.manual_control;
  }
  for (let route_n in true_route_set) {
    let route = true_route_set[route_n];
    let route_octet = Math.floor(route.bit_index/8);
    let route_bit = route.bit_index % 8;
    PLC_in_bit_arr[Ignore_approach_octet + route_octet][route_bit] = route.ignore_approach;
    PLC_in_bit_arr[Route_formation_demand_octet + route_octet][route_bit] = route.formation_command;
    PLC_in_bit_arr[Route_destruction_demand_octet + route_octet][route_bit] = route.destruction_command;
  }
  for (let signal_n in commanded_signal_set) {
    let signal = commanded_signal_set[signal_n];
    let signal_octet = Math.floor(signal.bit_index/8);
    let signal_bit = signal.bit_index % 8;
    PLC_in_bit_arr[Force_signal_closing_octet + signal_octet][signal_bit] = signal.close_command;
  }
  for (let TC_n in true_TC_set) {
    let TC = true_TC_set[TC_n];
    let TC_octet = Math.floor(TC.bit_index/8);
    let TC_bit = TC.bit_index % 8;
    PLC_in_bit_arr[TC_occupation_octet + TC_octet][TC_bit] = TC.occupied;
    PLC_in_bit_arr[Ignore_TC_occupation_octet + TC_octet][TC_bit] = TC.occupation_ignored;
  }
  getUintArray(PLC_in_bit_arr, uint_array);
}

function removeTrains() {
  for (let train of train_list) {
    train.exists = false;
    train.rear_pos = [seg_nil, -1];
    train.front_pos = [seg_nil, -1];
    train.orientation = "NA";
    train.error = false;
    clearTimeout(train.move_timeOut);
    train.timer_move = false;
  }
  for (let seg_n in all_seg_set) {
    let seg = all_seg_set[seg_n];
    seg.partial_occup = [];
  }
}

function failureTC(TC) {
  TC.failed = !TC.failed
}

function ignoreOccupation(TC) {
  TC.occupation_ignored = !TC.occupation_ignored
}

function check_coll(interval_test, interval_list) {
  for (let interval_i of interval_list) {
    if (!(interval_test[0] === interval_i[0])) {
    // The trains are different
      if ((interval_test[1] <= interval_i[2])
        &&(interval_test[2] >= interval_i[1])) {
      // The intervals overlap
        return true;
      }
    }
  }
  return false;
}

function sendTrain(seg, dir) {
  let [prev_seg, opp_prev_dir] = nextSeg(seg, opp_dir(dir), true_switch_set)
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
  for (let sw_n in true_switch_set) {
    let sw = true_switch_set[sw_n];
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
  for (let route_n in true_route_set) {
    let route = true_route_set[route_n];
    route.formation_command = document.getElementById(route.hmi_formation_ID).checked;
    route.destruction_command = document.getElementById(route.hmi_destruction_ID).checked;
    route.ignore_approach = document.getElementById(route.hmi_ignore_approach_ID).checked;
  }
  for (let signal_n in commanded_signal_set) {
    let signal = commanded_signal_set[signal_n];
    signal.close_command = document.getElementById(signal.hmi_close_ID).checked;
  }
}

function writeHmiOutputs() {
  for (let train of train_list) {
    train.draw();
  }
  for (let sw_n in true_switch_set) {
    let sw = true_switch_set[sw_n];
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
  for (let route_n in true_route_set) {
    let route = true_route_set[route_n];
    if (route.opened) {
      document.getElementById(route.hmi_ID).style.stroke = "green";
    } else {
      document.getElementById(route.hmi_ID).style.stroke = "black";
    }
  }
  for (let signal_n in true_signal_set) {
    let signal = true_signal_set[signal_n];
    if (!signal.always_closed) {
      if (signal.opened) {
        document.getElementById(signal.hmi_ID).style.fill = "green";
      } else {
        document.getElementById(signal.hmi_ID).style.fill = "red";
      }
    }
  }
  for (let TC_n in true_TC_set) {
    let TC = true_TC_set[TC_n];
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
  readPlcOutputs();
  readHmiInputs();
  for (let sw_n in true_switch_set) {
    let sw = true_switch_set[sw_n];
    sw.update_pos();
  }
  for (let train of train_list) {
    if (train.exists) {
      train.update_pos(true_switch_set);
    }
  }
  for (let TC_n in true_TC_set) {
    let TC = true_TC_set[TC_n];
    TC.update_occupation();
  }
  writeHmiOutputs();
  writePlcInputs(input_vector);
  websocket.send(input_buffer);
}

