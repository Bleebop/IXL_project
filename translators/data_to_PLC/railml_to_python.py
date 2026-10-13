import xml.etree.ElementTree as ET
import os

CUTOFF_FOULING_POINT_SEARCH = 50

def is_number(s):
    try:
        int(s)
        return True
    except ValueError:
        return False

    
def opposite_sw_pos(pos):
    if pos == "left":
        return "right"
    elif pos == "right":
        return "left"
    else:
        pass # TODO error handling


def opposite_dir(direction):
    if direction == "down":
        return "up"
    elif direction == "up":
        return "down"
    else:
        pass # TODO error handling


def search_ne(starting_ne, end_ne, direction, cutoff, depth, path):
    if starting_ne == end_ne:
        return [True, path]
    else:
        if depth >= cutoff:
            return [False, []]
        else:
            results = []
            if direction == "down":
                for dt_ne in starting_ne.downtrack_ne: ## dt_ne : [netelem, bool]
                    if dt_ne not in path:
                        new_dir = direction if dt_ne[1] else opposite_dir(direction)
                        results += [search_ne(dt_ne[0], end_ne, new_dir, cutoff, depth+1, path+[dt_ne])]
            else:
                for ut_ne in starting_ne.uptrack_ne: ## ut_ne : [netelem, bool]
                    if ut_ne not in path:
                        new_dir = direction if ut_ne[1] else opposite_dir(direction)
                        results += [search_ne(ut_ne[0], end_ne, new_dir, cutoff, depth+1, path+[ut_ne])]
            found = False
            found_path = []
            for res in results:
                if res[0]:
                    found = True
                    found_path = res[1]
                    break
            return [found, found_path]


def argmin(a):
    return min(range(len(a)), key=lambda x : a[x])


class NetElement:
    def __init__(self, railML_id, enum_val, railML_elem):
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_elem = railML_elem
        self.downtrack_ne = [] ## 0, 1 or 2 list(s) [net element, bool].
                               ## bool is true if both ne have the same orientation.
                               ## If 2, 1st is the one on the left, 2nd is on the right.
        self.uptrack_ne = [] ## Idem
        self.downtrack_switch = None
        self.uptrack_switch = None
        self.objects_inside_ne = [] ## list of [float, obj] (obj is "switch" for fouling points)
        self.cells = [] ## Listed in ascending coordinates


class Cell:
    # NetElements are partitioned into cells: each signal, tvd limit and
    # fouling point is a cell limit.
    def __init__(self, ident, net_element):
        self.ident = ident
        self.net_element = net_element
        self.coord = [-1,-1]
        self.tvd = None
        self.downtrack_cells = [] ## 0, 1 or 2 list(s) [cell, bool]. 
                                  ## bool is true if both cells have the same orientation.
                                  ## If 2, 1st is the one on the left, 2nd is on the right.
        self.uptrack_cells = [] ## Idem
        self.downtrack_obj = None ## switch/tvd limit/signal/fouling point/ne_limit/None
        self.uptrack_obj = None

    def next_cell(self, di):
        if di == "up":
            if len(self.uptrack_cells) != 1:
                return None
            else:
                return self.uptrack_cells[0]
        elif di == "down":
            if len(self.downtrack_cells) != 1:
                return None
            else:
                return self.downtrack_cells[0]
        else:
            return None

    def next_obj(self, di):
        if di == "up":
            return self.uptrack_obj
        elif di == "down":
            return self.downtrack_obj
        else:
            return None

class Route:
    def __init__(self, name, railML_id, enum_val, railML_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_elem = railML_elem
        self.tvds = []
        self.incompatible_route = []
        self.start_signal = None
        self.cross_switch = []
        self.require_switch = [] ## [switch object, "left/right"]
        self.delay_destruct = "Inf"
        self.approach_area = []


class Signal:
    def __init__(self, name, railML_id, enum_val, railML_IS_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_IS_elem = railML_IS_elem
        self.railML_IL_elem = None
        self.position = [] ## [net element, coord]
        self.dir = None ## bool, true if aligned with net element, false otherwise
        self.tvd_limit = None
        self.cells = [None, None] ## pair of cells, 1st is uptrack


class PermanentStop:
    def __init__(self, name, railML_id, railML_IS_elem):
        self.name = name
        self.railML_id = railML_id
        self.railML_IS_elem = railML_IS_elem
        self.position = [] ## [net element, coord]
        self.dir = None ## bool, true if aligned with net element, false otherwise
        self.tvd_limit = None ## If on a TVD limit
        self.cells = [None, None] ## If on a TVD limit, pair of cells, 1st is uptrack


class Switch:
    def __init__(self, name, railML_id, enum_val, railML_IS_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_IS_elem = railML_IS_elem
        self.railML_IL_elem = None
        self.tip_ne = None
        self.left_ne = None
        self.right_ne = None
        self.paired = [] ## [switch object, "left-left"/"left-right"]
                         ## "left-left" if both switches have to be commanded left or right at the same time
                         ## "left-right" otherwise (when one is commanded right, the other is commanded left)
        self.left_fouling_point_pos = [] ## [net element, coord]
        self.right_fouling_point_pos = [] ## [net element, coord]
        self.fouling_point_cells = [] ## [left_cells, right_cells], left_cells is a list of cells, ordered
                                      ## from switch to left fouling point, idem for right
        self.required_left_routes = []
        self.required_right_routes = []


class TvdLimit:
    def __init__(self, railML_id, railML_IS_elem):
        self.railML_id = railML_id
        self.railML_IS_elem = railML_IS_elem
        self.position = [] ## [net element, coord]
        self.tvds = [] ## pair of TVD (or less if on frontier), order is arbitrary


class Tvd:
    def __init__(self, name, railML_id, enum_val, railML_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_elem = railML_elem


class Interlocking:
    def __init__(self, name, netelements, routes, signals, permanentstops, switches, tvds, tvd_limits, cells):
        self.period = 100  # ms
        self.name = name
        self.netelements = netelements
        self.routes = routes
        self.signals = signals
        self.permanentstops = permanentstops
        self.switches = switches
        self.tvds = tvds
        self.tvd_limits = tvd_limits
        self.cells = cells


def xml_to_python(xml_file):
    IXL_name = os.path.basename(xml_file).split(".")[0]

    data_tree = ET.parse(xml_file)
    root = data_tree.getroot()

    netelement_dict = {}
    route_dict = {}
    signal_dict = {}
    permanentstop_dict = {}
    switch_dict = {}
    tvd_dict = {}
    tvd_limit_dict = {}
    cell_dict = {}

    interlocking = Interlocking(IXL_name,
                                netelement_dict,
                                route_dict,
                                signal_dict,
                                permanentstop_dict,
                                switch_dict,
                                tvd_dict,
                                tvd_limit_dict,
                                cell_dict)

    signal_IL_to_IS = {}
    switch_IL_to_IS = {}
    
    net_relation_dict = {}
    net_relation_treated = []

    route_rel_elem_dict = {}
    fouling_point_dict = {}

    ## first pass: creating all the instances
    nNetElement = 0
    for netelement_elem in root.findall("./infrastructure/topology/netElements/netElement"):
        nNetElement += 1
        netelement_dict[netelement_elem.get("id")] =\
            NetElement(netelement_elem.get("id"), nNetElement, netelement_elem)

    for net_relation_elem in root.findall("./infrastructure/topology/netRelations/netRelation"):
        net_relation_dict[net_relation_elem.get("id")] = net_relation_elem

    nRoute = 0
    for route_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/routes/route"):
        nRoute += 1
        route_railML_name = route_elem.find("./objectName").get("name")
        route_railML_id = route_elem.get("id")
        if route_railML_name:
            route_name = route_railML_name
        else:
            route_name = route_railML_id
        route_dict[route_railML_id] =\
            Route(route_name, route_railML_id, nRoute, route_elem)

    nSignal = 0
    for signalIS_elem in root.findall("./infrastructure/functionalInfrastructure/signalsIS/signalIS"):
        signal_railML_name = signalIS_elem.find("./name").get("name")
        signal_railML_IS_id = signalIS_elem.get("id")
        if signal_railML_name:
            signal_name = signal_railML_name
        else:
            signal_name = signal_railML_IS_id
        if signalIS_elem.get("isSwitchable") == "true":
            nSignal += 1
            signal_dict[signal_railML_IS_id] =\
                Signal(signal_name, signal_railML_IS_id, nSignal, signalIS_elem)
        else:
            permanentstop_dict[signal_railML_IS_id] =\
                PermanentStop(signal_name, signal_railML_IS_id, signalIS_elem)

    for signalIL_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/signalsIL/signalIL"):
        railML_IS_id = signalIL_elem.find("./refersTo").get("ref")
        signal_IL_to_IS[signalIL_elem.get("id")] = railML_IS_id
        if railML_IS_id in signal_dict:
            signal_dict[railML_IS_id].railML_IL_elem = signalIL_elem

    nSwitch = 0
    for switchIS_elem in root.findall("./infrastructure/functionalInfrastructure/switchesIS/switchIS"):
        nSwitch += 1
        switch_railML_name = switchIS_elem.find("./name").get("name")
        switch_railML_IS_id = switchIS_elem.get("id")
        if switch_railML_name:
            switch_name = switch_railML_name
        else:
            switch_name = switch_railML_IS_id
        switch_dict[switch_railML_IS_id] = Switch(switch_name, switch_railML_IS_id, nSwitch, switchIS_elem)

    for switchIL_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/switchesIL/switchIL"):
        railML_IS_id = switchIL_elem.find("./refersTo").get("ref")
        switch_IL_to_IS[switchIL_elem.get("id")] = railML_IS_id
        switch_dict[railML_IS_id].railML_IL_elem = switchIL_elem

    nTVD = 0
    for tvd_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/tvdSections/tvdSection"):
        nTVD += 1
        tvd_railML_name = tvd_elem.find("./assetName").get("name")
        tvd_railML_id = tvd_elem.get("id")
        if tvd_railML_name:
            tvd_name = tvd_railML_name
        else:
            tvd_name = tvd_railML_id
        tvd_dict[tvd_railML_id] = Tvd(tvd_name, tvd_railML_id, nTVD, tvd_elem)

    for route_rel_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/routeRelations/routeRelation"):
        route_rel_elem_dict[route_rel_elem.get("id")] = route_rel_elem

    for train_detect_elem in root.findall("./infrastructure/functionalInfrastructure/trainDetectionElements/trainDetectionElement"):
        train_detect_railML_id = train_detect_elem.get("id")
        if train_detect_elem.get("type") == "virtualClearancePoint":
            fouling_point_dict[train_detect_railML_id] = train_detect_elem
        else:
            tvd_limit_dict[train_detect_railML_id] =\
                TvdLimit(train_detect_railML_id, train_detect_elem)


    ## second pass: making the links
    for switch_obj in switch_dict.values():
        ## making links between net elements on switches
        switch_IS_elem = switch_obj.railML_IS_elem
        tip_ne_id = switch_IS_elem.find("./spotLocation").get("netElementRef")
        switch_obj.tip_ne = netelement_dict[tip_ne_id]
        net_relation_left_id = switch_IS_elem.find("./leftBranch").get("netRelationRef")
        net_relation_right_id = switch_IS_elem.find("./rightBranch").get("netRelationRef")
        net_relation_elem_left = net_relation_dict[net_relation_left_id]
        net_relation_elem_right = net_relation_dict[net_relation_right_id]
        nr_left_ne_A_id = net_relation_elem_left.find("./elementA").get("ref")
        nr_left_ne_B_id = net_relation_elem_left.find("./elementB").get("ref")
        nr_right_ne_A_id = net_relation_elem_right.find("./elementA").get("ref")
        nr_right_ne_B_id = net_relation_elem_right.find("./elementB").get("ref")
        nr_left_tip_is_A = nr_left_ne_A_id == tip_ne_id
        nr_right_tip_is_A = nr_right_ne_A_id == tip_ne_id
        left_ne_id = nr_left_ne_B_id if nr_left_tip_is_A else nr_left_ne_A_id
        right_ne_id = nr_right_ne_B_id if nr_right_tip_is_A else nr_right_ne_A_id
        tip_ne_obj = netelement_dict[tip_ne_id]
        left_ne_obj = netelement_dict[left_ne_id]
        right_ne_obj = netelement_dict[right_ne_id]
        switch_obj.left_ne = left_ne_obj
        switch_obj.right_ne = right_ne_obj

        tip_is_downtrack_tip = switch_IS_elem.find("./spotLocation").get("intrinsicCoord") == "1.0"
        ## Downtrack is after position 1 (it's weird, but opposite is weirder)
        ## |-------uptrack netelement------| |0------current netelement----->1| |-------downtrack netelement------|
        same_orient_left = (net_relation_elem_left.get("positionOnA") !=
                            net_relation_elem_left.get("positionOnB"))
        same_orient_right = (net_relation_elem_right.get("positionOnA") !=
                             net_relation_elem_right.get("positionOnB"))
        if tip_is_downtrack_tip:
            tip_ne_obj.downtrack_ne = [[left_ne_obj, same_orient_left],
                                       [right_ne_obj, same_orient_right]]
            tip_ne_obj.downtrack_switch = switch_obj
        else:
            tip_ne_obj.uptrack_ne = [[left_ne_obj, same_orient_left],
                                     [right_ne_obj, same_orient_right]]
            tip_ne_obj.uptrack_switch = switch_obj

        ne_left_positionOn = "positionOnB" if nr_left_tip_is_A else "positionOnA"
        ne_right_positionOn = "positionOnB" if nr_right_tip_is_A else "positionOnA"
        if net_relation_elem_left.get(ne_left_positionOn) == "1":
            left_ne_obj.downtrack_ne = [[tip_ne_obj, same_orient_left]]
            left_ne_obj.downtrack_switch = switch_obj
        else:
            left_ne_obj.uptrack_ne = [[tip_ne_obj, same_orient_left]]
            left_ne_obj.uptrack_switch = switch_obj
        if net_relation_elem_right.get(ne_right_positionOn) == "1":
            right_ne_obj.downtrack_ne = [[tip_ne_obj, same_orient_right]]
            right_ne_obj.downtrack_switch = switch_obj
        else:
            right_ne_obj.uptrack_ne = [[tip_ne_obj, same_orient_right]]
            right_ne_obj.uptrack_switch = switch_obj

        net_relation_treated += [net_relation_left_id, net_relation_right_id]

    for net_relation_elem in root.findall("./infrastructure/topology/netRelations/netRelation"):
        ## linking netelements without switches
        net_rel_id = net_relation_elem.get("id")
        if (net_rel_id not in net_relation_treated
            and net_relation_elem.get("navigability") == "Both"):
            net_elem_A_obj = netelement_dict[net_relation_elem.find("./elementA").get("ref")]
            net_elem_B_obj = netelement_dict[net_relation_elem.find("./elementB").get("ref")]
            same_orient = (net_relation_elem.get("positionOnA") !=
                           net_relation_elem.get("positionOnB"))
            downtrack_A = net_relation_elem.get("positionOnA") == "1"
            downtrack_B = net_relation_elem.get("positionOnB") == "1"
            if downtrack_A:
                net_elem_A_obj.downtrack_ne = [[net_elem_B_obj, same_orient]]
            else:
                net_elem_A_obj.uptrack_ne = [[net_elem_B_obj, same_orient]]
            if downtrack_B:
                net_elem_B_obj.downtrack_ne = [[net_elem_A_obj, same_orient]]
            else:
                net_elem_B_obj.uptrack_ne = [[net_elem_A_obj, same_orient]]

    # TODO : placeholder for double switches
            
    for route_conflict_elem in root.findall("./interlocking/assetsForInterlockings/assetsForInterlocking/conflictingRoutes/conflictingRoute"):
        route_1_id = route_conflict_elem.find("./refersToRoute").get("ref")
        route_2_id = route_conflict_elem.find("./conflictsWithRoute").get("ref")
        route_dict[route_1_id].incompatible_route += [route_dict[route_2_id]]

    for route_obj in route_dict.values():
        route_elem = route_obj.railML_elem

        for route_tvds in route_elem.findall("hasTvdSection"):
            route_obj.tvds +=\
                [tvd_dict[route_tvds.get("ref")]]

        start_sig_IS_id = signal_IL_to_IS[route_elem.find("./routeEntry/refersTo").get("ref")]
        if start_sig_IS_id is not None:
            route_obj.start_signal = signal_dict[start_sig_IS_id]

        for cross_switch_elem in route_elem.findall("facingSwitchInPosition"):
            cross_switch_IS_id = switch_IL_to_IS[cross_switch_elem.find("./refersToSwitch").get("ref")]
            switch_obj = switch_dict[cross_switch_IS_id]
            required_pos = cross_switch_elem.get("inPosition")
            route_obj.cross_switch +=\
                [[switch_obj, required_pos]]
            route_obj.require_switch +=\
                [[switch_obj, required_pos]]
            if required_pos == 'left':
                switch_obj.required_left_routes += [route_obj]
            elif required_pos == 'right':
                switch_obj.required_right_routes += [route_obj]

        for route_rel_ref in route_elem.findall("additionalRelation"):
            route_rel_elem = route_rel_elem_dict[route_rel_ref.get("ref")]
            for req_switch_ref in route_rel_elem.findall("requiredSwitchPosition"):
                req_switch_IS_id = switch_IL_to_IS[req_switch_ref.find("./relatedSwitchAndPosition/refersToSwitch").get("ref")]
                switch_obj = switch_dict[req_switch_IS_id]
                required_pos = req_switch_ref.find("./relatedSwitchAndPosition").get("inPosition")
                route_obj.require_switch +=\
                    [[switch_obj, required_pos]]
                if required_pos == 'left':
                    switch_obj.required_left_routes += [route_obj]
                elif required_pos == 'right':
                    switch_obj.required_right_routes += [route_obj]
        
        route_delay_destruct = route_elem.get("approachReleaseDelay")
        if route_delay_destruct == "PT-1S":
            route_obj.delay_destruct = "Inf"
        elif is_number(route_delay_destruct[2:-1]):
            route_obj.delay_destruct = route_delay_destruct[2:-1]
        else:
            route_obj.delay_destruct = "Inf"

        for activation_section_elem in route_elem.findall("routeActivationSection/activationSection"):
            tvd_obj = tvd_dict[activation_section_elem.get("ref")]
            route_obj.approach_area += [tvd_obj]

    for signal_obj in signal_dict.values():
        signal_IS_elem = signal_obj.railML_IS_elem
        signal_IL_elem = signal_obj.railML_IL_elem
        net_elem_obj = netelement_dict[signal_IS_elem.find("./spotLocation").get("netElementRef")]
        signal_pos = float(signal_IS_elem.find("./spotLocation").get("intrinsicCoord"))
        net_elem_obj.objects_inside_ne += [[signal_pos, signal_obj]]
        signal_obj.position = [net_elem_obj, signal_pos]
        signal_obj.dir = signal_IS_elem.find("./spotLocation").get("applicationDirection") == "normal"

    for permanentstop_obj in permanentstop_dict.values():
        permanentstop_IS_elem = permanentstop_obj.railML_IS_elem
        net_elem_obj = netelement_dict[permanentstop_IS_elem.find("./spotLocation").get("netElementRef")]
        permanentstop_pos = float(permanentstop_IS_elem.find("./spotLocation").get("intrinsicCoord"))
        net_elem_obj.objects_inside_ne += [[permanentstop_pos, permanentstop_obj]]
        permanentstop_obj.position = [net_elem_obj, permanentstop_pos]
        permanentstop_obj.dir = permanentstop_IS_elem.find("./spotLocation").get("applicationDirection") == "normal"

    for tvd_limit_obj in tvd_limit_dict.values():
        tvd_limit_elem = tvd_limit_obj.railML_IS_elem
        net_elem_obj = netelement_dict[tvd_limit_elem.find("./spotLocation").get("netElementRef")]
        tvd_limit_pos = float(tvd_limit_elem.find("./spotLocation").get("intrinsicCoord"))
        signals_pos = [obj_inside_ne[0] for obj_inside_ne in net_elem_obj.objects_inside_ne]
        dist_to_sigs = [abs(tvd_limit_pos-signal_pos) for signal_pos in signals_pos]
        if signals_pos:
            ind_min = argmin(dist_to_sigs)
        if not signals_pos or dist_to_sigs[ind_min] > 0.001:
            net_elem_obj.objects_inside_ne += [[tvd_limit_pos, tvd_limit_obj]]
        else:
            net_elem_obj.objects_inside_ne[ind_min][1].tvd_limit = tvd_limit_obj


    for tvd_obj in tvd_dict.values():
        tvd_IL_elem = tvd_obj.railML_elem
        for tvd_limit_ref in tvd_IL_elem.findall("hasDemarcatingTraindetector"):
            tvd_limit_obj = tvd_limit_dict[tvd_limit_ref.get("ref")]
            tvd_limit_obj.tvds += [tvd_obj]

    for switch_obj in switch_dict.values():
        switch_IS_elem = switch_obj.railML_IS_elem
        switch_IL_elem = switch_obj.railML_IL_elem

        fouling_point_ne_obj = []
        fouling_point_pos = []
        for fouling_point_ref in switch_IL_elem.findall("hasGaugeClearanceMarker"):
            fouling_point_elem = fouling_point_dict[fouling_point_ref.get("ref")]
            ne_obj = netelement_dict[fouling_point_elem.find("./spotLocation").get("netElementRef")]
            fouling_point_ne_obj += [ne_obj]
            fp_pos = float(fouling_point_elem.find("./spotLocation").get("intrinsicCoord"))
            fouling_point_pos += [fp_pos]
            ne_obj.objects_inside_ne += [[fp_pos, switch_obj]]

        if len(fouling_point_ne_obj) != 2: ## more than 2 fouling points
            pass # TODO error handling
        
        left_ne_obj = switch_obj.left_ne
        right_ne_obj = switch_obj.right_ne
        if switch_obj.left_ne.downtrack_switch == switch_obj:
            start_dir_left = "up"
        else:
            start_dir_left = "down"
        if switch_obj.right_ne.downtrack_switch == switch_obj:
            start_dir_right = "up"
        else:
            start_dir_right = "down"
        result_left = [[],[]]
        for i, ne_obj_tar in enumerate(fouling_point_ne_obj):
            result_left[i] = search_ne(left_ne_obj, ne_obj_tar, start_dir_left,
                CUTOFF_FOULING_POINT_SEARCH, 0, [[left_ne_obj, start_dir_left]])
        if result_left[0][0] and not result_left[1][0]:
            left_ind = 0
        elif not result_left[0][0] and result_left[1][0]:
            left_ind = 1
        elif result_left[0][0] and result_left[1][0]: ## Could happen in loops...
            left_ind = 0 if len(result_left[0][1]) < len(result_left[1][1]) else 1
                ## Don't put both fouling points on the same netelement in a loop
        else: ## no fouling point found from the left branch
            pass # TODO error handling
        
        right_ind = 1-left_ind
        search_right_res = search_ne(right_ne_obj, fouling_point_ne_obj[right_ind], start_dir_right,
            CUTOFF_FOULING_POINT_SEARCH, 0, [[right_ne_obj, start_dir_right]])
        if not search_right_res[0]: ## Other fouling point not found from the right branch
            pass # TODO error handling

        switch_obj.left_fouling_point_pos = [fouling_point_ne_obj[left_ind], fouling_point_pos[left_ind]]
        switch_obj.right_fouling_point_pos = [fouling_point_ne_obj[right_ind], fouling_point_pos[right_ind]]

        if switch_IL_elem.find("./relatedMovableElement") != None:
            paired_switch_IL_elem = switch_IL_elem.find("./relatedMovableElement")
            paired_sw_obj = switch_dict[switch_IL_to_IS[paired_switch_IL_elem.get("ref")]]
            switch_obj.paired = [paired_sw_obj, ""]

            corresp_set = False
            for route_obj_left in switch_obj.required_left_routes:
                ## For each common route
                if route_obj_left in paired_sw_obj.required_left_routes:
                    if not corresp_set:
                        ## If a route require both switches to be in the left position
                        ## we register that these switch are paired left-left
                        corresp_set = True
                        switch_obj.paired[1] = "left-left"
                    elif switch_obj.paired[1] != "left-left":
                        ## If another route is incompatible => Error
                        pass # TODO error handling
                elif route_obj_left in paired_sw_obj.required_right_routes:
                    if not corresp_set:
                        ## If a route require one at right and the other at left
                        ## we register that these switch are paired left-right
                        corresp_set = True
                        switch_obj.paired[1] = "left-right"
                    elif switch_obj.paired[1] != "left-right":
                        ## If another route is incompatible => Error
                        pass # TODO error handling
            for route_obj_right in switch_obj.required_right_routes:
                if route_obj_right in paired_sw_obj.required_left_routes:
                    if not corresp_set:
                        corresp_set = True
                        switch_obj.paired[1] = "left-right"
                    elif switch_obj.paired[1] != "left-right":
                        pass # TODO error handling
                elif route_obj_right in paired_sw_obj.required_right_routes:
                    if not corresp_set:
                        corresp_set = True
                        switch_obj.paired[1] = "left-left"
                    elif switch_obj.paired[1] != "left-left":
                        pass # TODO error handling

            if not corresp_set:
                ## No common route was found, why are they paired?
                pass # TODO error handling

    for net_elem_obj in netelement_dict.values():
        net_elem_obj.objects_inside_ne = sorted(net_elem_obj.objects_inside_ne, key=lambda x: x[0])
        
        cell_ind = 0
        cell_id = net_elem_obj.railML_id + f"_c{cell_ind:02}"
        net_elem_obj.cells += [Cell(cell_id, net_elem_obj)]
        cell_dict[cell_id] = net_elem_obj.cells[cell_ind]
        net_elem_obj.cells[cell_ind].coord[0] = 0
        if net_elem_obj.uptrack_switch:
            net_elem_obj.cells[cell_ind].uptrack_obj = net_elem_obj.uptrack_switch
        elif net_elem_obj.uptrack_ne:
            net_elem_obj.cells[cell_ind].uptrack_obj = net_elem_obj.uptrack_ne[0][0]

        for obj_inside in net_elem_obj.objects_inside_ne:
            net_elem_obj.cells[cell_ind].coord[1] = obj_inside[0]
            net_elem_obj.cells[cell_ind].downtrack_obj = obj_inside[1]

            cell_ind += 1
            cell_id = net_elem_obj.railML_id + f"_c{cell_ind:02}"
            net_elem_obj.cells += [Cell(cell_id, net_elem_obj)]
            cell_dict[cell_id] = net_elem_obj.cells[cell_ind]
            net_elem_obj.cells[cell_ind-1].downtrack_cells = [[net_elem_obj.cells[cell_ind], True]]
            net_elem_obj.cells[cell_ind].uptrack_cells = [[net_elem_obj.cells[cell_ind-1], True]]
            net_elem_obj.cells[cell_ind].coord[0] = obj_inside[0]
            net_elem_obj.cells[cell_ind].uptrack_obj = obj_inside[1]
            if (isinstance(obj_inside[1], Signal)
                or isinstance(obj_inside[1], PermanentStop)):
                if obj_inside[1].dir:
                    obj_inside[1].cells = [net_elem_obj.cells[cell_ind-1], net_elem_obj.cells[cell_ind]]
                else:
                    obj_inside[1].cells = [net_elem_obj.cells[cell_ind], net_elem_obj.cells[cell_ind-1]]

        net_elem_obj.cells[cell_ind].coord[1] = 1
        if net_elem_obj.downtrack_switch:
            net_elem_obj.cells[cell_ind].downtrack_obj = net_elem_obj.downtrack_switch
        elif net_elem_obj.downtrack_ne:
            net_elem_obj.cells[cell_ind].downtrack_obj = net_elem_obj.downtrack_ne[0][0]

    for net_elem_obj in netelement_dict.values():
        first_cell = net_elem_obj.cells[0]
        for [uptrack_ne, same_dir] in net_elem_obj.uptrack_ne:
            if same_dir:
                neigh_cell = uptrack_ne.cells[-1]
            else:
                neigh_cell = uptrack_ne.cells[0]
            first_cell.uptrack_cells += [[neigh_cell, same_dir]]
        last_cell = net_elem_obj.cells[-1]
        for [downtrack_ne, same_dir] in net_elem_obj.downtrack_ne:
            if same_dir:
                neigh_cell = downtrack_ne.cells[0]
            else:
                neigh_cell = downtrack_ne.cells[-1]
            last_cell.downtrack_cells += [[neigh_cell, same_dir]]

    visited_cells = []
    for origin_cell in cell_dict.values():
        if origin_cell in visited_cells:
            continue
        tvd_cand = []
        tvdfound = None
        outside_tvd = False
        same_TVD_cells = []
        active_cells = [origin_cell]
        while active_cells:
            cell = active_cells.pop()
            same_TVD_cells += [cell]
            for i in [0,1]:
                if i == 0:
                    neigh_obj = cell.downtrack_obj
                    neigh_cells = cell.downtrack_cells
                else:
                    neigh_obj = cell.uptrack_obj
                    neigh_cells = cell.uptrack_cells
                if not (isinstance(neigh_obj, TvdLimit)
                        or isinstance(neigh_obj, Signal)
                        or (isinstance(neigh_obj, PermanentStop)
                            and neigh_obj.tvd_limit)
                        or neigh_obj is None):
                    for neigh_cell_p in neigh_cells:
                        if (neigh_cell_p[0] not in same_TVD_cells
                            and neigh_cell_p[0] not in active_cells):
                            active_cells += [neigh_cell_p[0]]
                elif not tvdfound and not outside_tvd:
                    if neigh_obj is None:
                        outside_tvd = True
                    else:
                        if isinstance(neigh_obj, TvdLimit):
                            tvd_list = neigh_obj.tvds
                        elif (isinstance(neigh_obj, Signal)
                            or (isinstance(neigh_obj, PermanentStop)
                                and neigh_obj.tvd_limit)
                            ):
                            tvd_list = neigh_obj.tvd_limit.tvds
                        else:
                            pass # TODO error handling
                        if not tvd_cand:
                            tvd_cand = tvd_list
                        else:
                            for tvd in tvd_list:
                                if tvd in tvd_cand:
                                    tvdfound = tvd
        for cell in same_TVD_cells:
            cell.tvd = tvdfound
        visited_cells += same_TVD_cells

    for switch in switch_dict.values():
        if switch.left_ne.downtrack_switch == switch:
            start_left_cell = switch.left_ne.cells[-1]
            start_left_dir = "up"
        else:
            start_left_cell = switch.left_ne.cells[0]
            start_left_dir = "down"
        if switch.right_ne.downtrack_switch == switch:
            start_right_cell = switch.right_ne.cells[-1]
            start_right_dir = "up"
        else:
            start_right_cell = switch.right_ne.cells[0]
            start_right_dir = "down"

        for [start_cell, start_dir] in [[start_left_cell, start_left_dir], [start_right_cell, start_right_dir]]:
            fp_found = False
            depth = 0
            active_cell = start_cell
            current_dir = start_dir
            visited_cells = [active_cell]
            while (active_cell.next_obj(current_dir) != switch):
                depth += 1
                [active_cell, same_dir] = active_cell.next_cell(current_dir)
                if not same_dir:
                    current_dir = opposite_dir(current_dir)
                visited_cells += [active_cell]
                if depth >= CUTOFF_FOULING_POINT_SEARCH:
                    break
            else:
                fp_found = True
            if fp_found:
                switch.fouling_point_cells += [visited_cells]
            else:
                pass # TODO error handling

    return interlocking

