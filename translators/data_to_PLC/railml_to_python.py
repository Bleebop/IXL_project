import sys
import xml.etree.ElementTree as ET
import time
import os


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


class NetElement:
    def __init__(self, railML_id, enum_val, railML_elem):
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.downtrack_ne = []
        self.uptrack_ne = []
        self.railML_elem = railML_elem


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


class Switch:
    def __init__(self, name, railML_id, enum_val, railML_IS_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_IS_elem = railML_IS_elem
        self.railML_IL_elem = None
        self.paired = [] ## [switch object, "left-left"/"left-right"]
                         ## "left-left" if both switches have to be commanded left or right at the same time
                         ## "left-right" otherwise (when one is commanded right, the other is commanded left)
        self.fouling_point_tvd = []
        self.required_left_routes = []
        self.required_right_routes = []


class Tvd:
    def __init__(self, name, railML_id, enum_val, railML_elem):
        self.name = name
        self.railML_id = railML_id
        self.enum_val = enum_val
        self.railML_elem = railML_elem


class Interlocking:
    def __init__(self, name, netelements, routes, signals, switches, tvds):
        self.period = 100  # ms
        self.name = name
        self.netelements = netelements
        self.routes = routes
        self.signals = signals
        self.switches = switches
        self.tvds = tvds


def xml_to_python(xml_file):
    IXL_name = os.path.basename(xml_file).split(".")[0]

    data_tree = ET.parse(xml_file)
    root = data_tree.getroot()

    netelement_dict = {}
    route_dict = {}
    signal_dict = {}
    switch_dict = {}
    tvd_dict = {}

    interlocking = Interlocking(IXL_name,
                                netelement_dict,
                                route_dict,
                                signal_dict,
                                switch_dict,
                                tvd_dict)

    signal_IL_to_IS = {}
    switch_IL_to_IS = {}

    route_rel_elem_dict = {}

    # first pass: creating all the instances
    nNetElement = 0
    for netelement_elem in root.findall("./infrastructure/topology/netElements/netElement"):
        nNetElement += 1
        netelement_dict[netelement_elem.get("id")] =\
            NetElement(netelement_elem.get("id"), nNetElement, netelement_elem)

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

    # second pass: making the links
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


    for switch_obj in switch_dict.values():
        switch_IS_elem = switch_obj.railML_IS_elem
        switch_IL_elem = switch_obj.railML_IL_elem

        if switch_IL_elem.find("./relatedMovableElement") != None:
            paired_switch_IL_elem = switch_IL_elem.find("./relatedMovableElement")
            paired_sw_obj = switch_dict[switch_IL_to_IS[paired_switch_IL_elem.get("ref")]]
            switch_obj.paired = [paired_sw_obj, None]

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

        # TODO fouling point tvd

    return interlocking

