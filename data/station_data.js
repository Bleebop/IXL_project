import {TrackCircuit, Segment, Switch, Route, Signal, Train} from "./classes.js";

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

const n_true_TC = 16;
const n_border_TC = 4;

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

const TC_map = new Map();
TC_map.set("TC_101", TC_101);
TC_map.set("TC_102", TC_102);
TC_map.set("TC_103", TC_103);
TC_map.set("TC_104", TC_104);
TC_map.set("TC_105", TC_105);
TC_map.set("TC_106", TC_106);
TC_map.set("TC_107", TC_107);
TC_map.set("TC_108", TC_108);
TC_map.set("TC_109", TC_109);
TC_map.set("TC_110", TC_110);
TC_map.set("TC_111", TC_111);
TC_map.set("TC_112", TC_112);
TC_map.set("TC_113", TC_113);
TC_map.set("TC_114", TC_114);
TC_map.set("TC_115", TC_115);
TC_map.set("TC_116", TC_116);

const n_true_seg = 20;
const n_border_seg = 4;

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
const seg_99    = new Segment("seg_99"   , null , false, true , ""  , [[0,220],[80,220]]);
const seg_100   = new Segment("seg_100"  , null, false, true , ""  , [[0,100],[80,100]]);
const seg_117   = new Segment("seg_117"  , null, false, true , ""  , [[1000,220],[1080,220]]);
const seg_118   = new Segment("seg_118"  , null, false, true , ""  , [[1000,100],[1080,100]]);

const seg_map = new Map();
seg_map.set("seg_101", seg_101);
seg_map.set("seg_102", seg_102);
seg_map.set("seg_103", seg_103);
seg_map.set("seg_104", seg_104);
seg_map.set("seg_105", seg_105);
seg_map.set("seg_106", seg_106);
seg_map.set("seg_107", seg_107);
seg_map.set("seg_108", seg_108);
seg_map.set("seg_109_t", seg_109_t);
seg_map.set("seg_109_l", seg_109_l);
seg_map.set("seg_109_r", seg_109_r);
seg_map.set("seg_110_t", seg_110_t);
seg_map.set("seg_110_l", seg_110_l);
seg_map.set("seg_110_r", seg_110_r);
seg_map.set("seg_111", seg_111);
seg_map.set("seg_112", seg_112);
seg_map.set("seg_113", seg_113);
seg_map.set("seg_114", seg_114);
seg_map.set("seg_115", seg_115);
seg_map.set("seg_116", seg_116);
seg_map.set("seg_99", seg_99);
seg_map.set("seg_100", seg_100);
seg_map.set("seg_117", seg_117);
seg_map.set("seg_118", seg_118);

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

const switch_list = [
  sw_01,
  sw_02
];

const n_true_route = 6
const route_AB = new Route("AB", 0, true, "hmi_route_AB", "routeFormation_route_AB", "routeDestruction_route_AB", "ignoreApproach_route_AB");
const route_BC = new Route("BC", 1, true, "hmi_route_BC", "routeFormation_route_BC", "routeDestruction_route_BC", "ignoreApproach_route_BC");
const route_ED = new Route("ED", 2, true, "hmi_route_ED", "routeFormation_route_ED", "routeDestruction_route_ED", "ignoreApproach_route_ED");
const route_CD = new Route("CD", 3, true, "hmi_route_CD", "routeFormation_route_CD", "routeDestruction_route_CD", "ignoreApproach_route_CD");
const route_DC = new Route("DC", 4, true, "hmi_route_DC", "routeFormation_route_DC", "routeDestruction_route_DC", "ignoreApproach_route_DC");
const route_CB = new Route("CB", 5, true, "hmi_route_CB", "routeFormation_route_CB", "routeDestruction_route_CB", "ignoreApproach_route_CB");

const route_list = [
  route_AB,
  route_BC,
  route_ED,
  route_CD,
  route_DC,
  route_CB
];

const n_true_signal = 5;
const n_static_signal = 1;
const signal_201 = new Signal("sig_201", false, 0, true, "hmi_sig_201", "closeSignal_201", seg_103, "up");
const signal_203 = new Signal("sig_203", false, 1, true, "hmi_sig_203", "closeSignal_203", seg_107, "up");
const signal_205 = new Signal("sig_205", false, 2, true, "hmi_sig_205", "closeSignal_205", seg_108, "up");
const signal_206 = new Signal("sig_206", false, 3, true, "hmi_sig_206", "closeSignal_206", seg_111, "down");
const signal_208 = new Signal("sig_208", false, 4, true, "hmi_sig_208", "closeSignal_208", seg_112, "down");
const perm_stop_02 = new Signal("PS_02", true, null, true, "", "", seg_107, "down");

const signal_list = [
  signal_201,
  signal_203,
  signal_205,
  signal_206,
  signal_208,
  perm_stop_02
];

const train_1 = new Train("Train 1", "#FF0000", "hmi_train_1", "Stop_Train_T1", "Train_Error_T1", 1000);
const train_2 = new Train("Train 2", "#00FF00", "hmi_train_2", "Stop_Train_T2", "Train_Error_T2", 1000);
const train_3 = new Train("Train 3", "#0000FF", "hmi_train_3", "Stop_Train_T3", "Train_Error_T3", 1000);
const train_4 = new Train("Train 4", "#FFFF00", "hmi_train_4", "Stop_Train_T4", "Train_Error_T4", 1000);
const train_5 = new Train("Train 5", "#FF00FF", "hmi_train_5", "Stop_Train_T5", "Train_Error_T5", 1000);
const train_6 = new Train("Train 6", "#00FFFF", "hmi_train_6", "Stop_Train_T6", "Train_Error_T6", 1000);
const train_list = [train_1, train_2, train_3, train_4, train_5, train_6];


seg_101.next_seg_up_left = [seg_103, "up"];
seg_101.next_seg_down_left = [seg_99, "down"];
seg_102.next_seg_up_left = [seg_104, "up"];
seg_102.next_seg_down_left = [seg_100, "down"];
seg_103.next_seg_up_left = [seg_105, "up"];
seg_103.next_seg_down_left = [seg_101, "down"];
seg_104.next_seg_up_left = [seg_106, "up"];
seg_104.next_seg_down_left = [seg_102, "down"];
seg_105.next_seg_up_left = [seg_107, "up"];
seg_105.next_seg_down_left = [seg_103, "down"];
seg_106.next_seg_up_left = [seg_108, "up"];
seg_106.next_seg_down_left = [seg_104, "down"];
seg_107.next_seg_up_left = [seg_109_l, "up"];
seg_107.next_seg_down_left = [seg_105, "down"];
seg_108.next_seg_up_left = [seg_110_t, "up"];
seg_108.next_seg_down_left = [seg_106, "down"];

seg_109_l.switch_up = sw_02;
seg_109_l.next_seg_up_left = [seg_109_t, "up"];
seg_109_l.next_seg_down_left = [seg_107, "down"];

seg_109_t.switch_down = sw_02;
seg_109_t.next_seg_up_left = [seg_111, "up"];
seg_109_t.next_seg_down_left = [seg_109_l, "down"];
seg_109_t.next_seg_down_right = [seg_109_r, "down"];

seg_109_r.switch_up = sw_02;
seg_109_r.next_seg_up_right = [seg_109_t, "up"];
seg_109_r.next_seg_down_left = [seg_110_r, "down"];

seg_110_t.switch_up = sw_01;
seg_110_t.next_seg_up_left = [seg_110_l, "up"];
seg_110_t.next_seg_up_right = [seg_110_r, "up"];
seg_110_t.next_seg_down_left = [seg_108, "down"];

seg_110_l.switch_down = sw_01;
seg_110_l.next_seg_up_left = [seg_112, "up"];
seg_110_l.next_seg_down_left = [seg_110_t, "down"];

seg_110_r.switch_down = sw_01;
seg_110_r.next_seg_up_left = [seg_109_r, "up"];
seg_110_r.next_seg_down_right = [seg_110_t, "down"];

seg_111.next_seg_up_left = [seg_113, "up"];
seg_111.next_seg_down_left = [seg_109_t, "down"];
seg_112.next_seg_up_left = [seg_114, "up"];
seg_112.next_seg_down_left = [seg_110_l, "down"];
seg_113.next_seg_up_left = [seg_115, "up"];
seg_113.next_seg_down_left = [seg_111, "down"];
seg_114.next_seg_up_left = [seg_116, "up"];
seg_114.next_seg_down_left = [seg_112, "down"];
seg_115.next_seg_up_left = [seg_117, "up"];
seg_115.next_seg_down_left = [seg_113, "down"];
seg_116.next_seg_up_left = [seg_118, "up"];
seg_116.next_seg_down_left = [seg_114, "down"];

seg_99.next_seg_up_left = [seg_101, "up"];
seg_100.next_seg_up_left = [seg_102, "up"];
seg_117.next_seg_down_left = [seg_115, "down"];
seg_118.next_seg_down_left = [seg_116, "down"];


export {TC_map, seg_map, switch_list, route_list, signal_list, train_list};
