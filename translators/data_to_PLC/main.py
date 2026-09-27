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


def fbd_input_variable_str(local_id, expression):
    output_str = \
        '            <inVariable localId="{}">\n' \
        '              <position x="0" y="0" />\n' \
        '              <connectionPointOut />\n' \
        '              <expression>{}</expression>\n' \
        '            </inVariable>\n'.format(local_id, expression)
    return output_str


def fbd_output_variable_str(local_id, input_addr, expression):
    if input_addr[1]:
        input_addr[1] = ' formalParameter="' + input_addr[1] + '"'
    output_str = \
        '            <outVariable localId="{}">\n' \
        '              <position x="0" y="0" />\n' \
        '              <connectionPointIn>\n' \
        '                <connection refLocalId="{}"{} />\n' \
        '              </connectionPointIn>\n' \
        '              <expression>{}</expression>\n' \
        '            </outVariable>\n'.format(local_id, *input_addr, expression)
    return output_str


def fbd_block_str(local_id, type_name, instance_name,
                  input_addr_list, input_port_name_list,
                  block_outputs):
    block_inputs_str = ''
    for i, input_addr in enumerate(input_addr_list):
        if not input_port_name_list:
            input_port_name = 'In'+str(i+1)
        else:
            input_port_name = input_port_name_list[i]
        if input_addr[1]:
            upstream_port_name = ' formalParameter="' + input_addr[1] + '"'
        else:
            upstream_port_name = ''
        block_input_formatted = [input_port_name,
                                 input_addr[0],
                                 upstream_port_name]
        block_inputs_str += \
            '                <variable formalParameter="{}">\n' \
            '                  <connectionPointIn>\n' \
            '                    <connection refLocalId="{}"{} />\n' \
            '                  </connectionPointIn>\n' \
            '                </variable>\n'.format(*block_input_formatted)
    block_outputs_str = ''
    for i, block_output in enumerate(block_outputs):
        block_outputs_str += \
            '                <variable formalParameter="{}">\n' \
            '                  <connectionPointOut />\n' \
            '                </variable>\n'.format(block_output)
    if instance_name:
        instance_name = ' instanceName="' + instance_name + '"'
    output_str = \
        '            <block localId="{}" typeName="{}"{}>\n' \
        '              <position x="0" y="0" />\n' \
        '              <inputVariables>\n' \
        '{}' \
        '              </inputVariables>\n' \
        '              <inOutVariables />\n' \
        '              <outputVariables>\n' \
        '{}' \
        '              </outputVariables>\n' \
        '            </block>\n' \
        .format(local_id, type_name, instance_name,
                block_inputs_str, block_outputs_str)

    return output_str


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
        self.require_switch = []
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
        elif is_number(route_delay_destruct):
            route_obj.delay_destruct = route_delay_destruct
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

        if switch_IL_elem.find("relatedMovableElement"):
            paired_switch_IL_elem = switch_IL_elem.find("relatedMovableElement")
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


def python_to_openplc(interlocking, openplc_mold, openplc_file_path):

    safety_PLC_FBD = ''
    fbd_page = 0
    for route in interlocking.routes.values():
        fbd_page += 1

        # Route formation demand
        local_id = (fbd_page*10000000000)
        route_formation_demand_expr =\
            'var_g.route_formation_demand[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            route_formation_demand_expr)
        route_formation_demand_addr = [str(local_id), '']

        # Incompatible routes demands
        if not route.incompatible_route:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), 'FALSE')
            incompatible_route_demand_addr = [str(local_id), '']
        else:
            or_incomp_demand_inputs = []
            for incomp_route in route.incompatible_route:
                local_id += 1
                incompatible_route_demand_expr = \
                    'var_g.route_formation_demand[ROUTE.' + \
                    incomp_route.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id),
                    incompatible_route_demand_expr)
                or_incomp_demand_inputs += [[str(local_id), '']]
            if len(route.incompatible_route) == 1:
                incompatible_route_demand_addr = [str(local_id), '']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_incomp_demand_inputs, [],
                                                ['Out1'])
                incompatible_route_demand_addr = [str(local_id), 'Out1']

        # Incompatible routes states
        if not route.incompatible_route:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), 'FALSE')
            incompatible_route_state_addr = [str(local_id), '']
        else:
            or_incomp_state_inputs = []
            for incomp_route in route.incompatible_route:
                local_id += 1
                incompatible_route_state_expr = \
                    'route_open[ROUTE.' + incomp_route.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id),
                    incompatible_route_state_expr)
                or_incomp_state_inputs += [[str(local_id), '']]
            if len(or_incomp_state_inputs) == 1:
                incompatible_route_state_addr = [str(local_id), '']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_incomp_state_inputs, [],
                                                ['Out1'])
                incompatible_route_state_addr = [str(local_id), 'Out1']

        # Route destruction demand
        local_id += 1
        route_destruction_demand_expr = \
            'route_destruction_demand[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            route_destruction_demand_expr)
        route_destruction_demand_addr = [str(local_id), '']

        # Transit TVDs occupation
        if len(route.tvds) <= 2:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id),
                'TRUE')
            transit_tvds_free_addr = [str(local_id), '']
        else:
            and_transit_tvds_inputs = []
            for tvd in route.tvds[:-1]:
                local_id += 1
                transit_tvd_occupied_expr = \
                    'var_g.TC_occupied[TC.' + tvd.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id),
                    transit_tvd_occupied_expr)
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                                [[str(local_id-1), '']], [],
                                                ['Out1'])
                unoccupied_tvd_addr = [str(local_id), 'Out1']
                local_id += 1
                transit_tvd_ignore_expr = \
                    'var_g.ignore_TC_occupation[TC.' + tvd.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id),
                    transit_tvd_ignore_expr)
                ignore_tvd_addr = [str(local_id), '']
                local_id += 1
                safety_PLC_FBD += fbd_block_str(
                    local_id, 'OR', '',
                    [unoccupied_tvd_addr, ignore_tvd_addr], [],
                    ['Out1'])
                and_transit_tvds_inputs += [[str(local_id), 'Out1']]
            if len(and_transit_tvds_inputs) == 1:
                transit_tvds_free_addr = [str(local_id), 'Out1']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                                and_transit_tvds_inputs, [],
                                                ['Out1'])
                transit_tvds_free_addr = [str(local_id), 'Out1']

        # Approach area occupation
        if not route.approach_area:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), 'TRUE')
            # TODO parametrize what to do when no approach area/start signal
            approach_area_occupied_addr = [str(local_id), '']
        else:
            or_approach_area_inputs = []
            for tvd in route.approach_area:
                local_id += 1
                approach_tvd_occupied_expr = \
                    'var_g.TC_occupied[TC.' + tvd.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id),
                    approach_tvd_occupied_expr)
                or_approach_area_inputs += [[str(local_id), '']]
            if len(or_approach_area_inputs) == 1:
                approach_area_occupied_addr = [str(local_id), '']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_approach_area_inputs, [],
                                                ['Out1'])
                approach_area_occupied_addr = [str(local_id), 'Out1']

        if not route.start_signal:
            origin_signal_open_expr = 'TRUE'
            # TODO parametrize what to do when no approach area/start signal
        else:
            origin_signal_open_expr = \
                'signal_open_maneuver[SIGNAL.' + route.start_signal.name + ']'
        local_id += 1
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            origin_signal_open_expr)
        origin_signal_open_addr = [str(local_id), '']

        if route.delay_destruct == 'Inf':
            # TODO parametrize what to do when no destruct delay
            delay_destruct_expr = 'DELAY_DESTRUCT[ROUTE.' + route.name + ']'
        else:
            delay_destruct_expr = 'DELAY_DESTRUCT[ROUTE.' + route.name + ']'
        local_id += 1
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            delay_destruct_expr)
        delay_destruct_addr = [str(local_id), '']

        local_id += 1
        ignore_approach_expr = 'var_g.ignore_approach[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            ignore_approach_expr)
        ignore_approach_addr = [str(local_id), '']

        # Risk of approaching train
        local_id += 1
        appr_train_inst_name = 'Approaching_train[ROUTE.' + route.name + ']'
        appr_train_input_addr_list = [approach_area_occupied_addr,
                                      origin_signal_open_addr,
                                      delay_destruct_addr,
                                      ignore_approach_addr]
        appr_train_input_name_list = ['approach_area_occupied',
                                      'origin_signal_open',
                                      'DELAY_DESTRUCT',
                                      'route_destruction_approach_ack']
        safety_PLC_FBD += fbd_block_str(local_id, 'Approaching_train',
                                        appr_train_inst_name,
                                        appr_train_input_addr_list,
                                        appr_train_input_name_list,
                                        ['risk_of_approaching_train'])
        risk_of_approaching_train_addr = [str(local_id),
                                          'risk_of_approaching_train']

        # Route state
        local_id += 1
        route_state_inst_name = 'route_state[ROUTE.' + route.name + ']'
        route_state_input_addr_list = [route_formation_demand_addr,
                                      incompatible_route_demand_addr,
                                      incompatible_route_state_addr,
                                      route_destruction_demand_addr,
                                      transit_tvds_free_addr,
                                      risk_of_approaching_train_addr]
        route_state_input_name_list = ['route_formation_demand',
                                       'incompatible_routes_demand',
                                       'incompatible_routes_opened',
                                       'route_destruction_demand',
                                       'Transit_TCs_free',
                                       'risk_of_approaching_train']
        safety_PLC_FBD += fbd_block_str(local_id, 'route_state',
                                        route_state_inst_name,
                                        route_state_input_addr_list,
                                        route_state_input_name_list,
                                        ['route_open'])

        local_id += 1
        route_state_expr = 'route_open[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                  [local_id-1, 'route_open'],
                                                  route_state_expr)

    for switch in interlocking.switches.values():

        # Switch locked
        fbd_page += 1
        local_id = (fbd_page*10000000000)-1

        # Switch TVDs occupation
        switch_tvds = switch.fouling_point_tvd

        or_switch_tvds_inputs = []
        for tvd in switch_tvds:
            local_id += 1
            switch_tvd_occupied_expr = \
                'var_g.TC_occupied[TC.' + tvd.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_tvd_occupied_expr)
            occupied_tvd_addr = [str(local_id), '']
            local_id += 1
            switch_tvd_ignore_expr = \
                'var_g.ignore_TC_occupation[TC.' + tvd.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_tvd_ignore_expr)
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            [[str(local_id - 1), '']], [],
                                            ['Out1'])
            not_ignore_tvd_addr = [str(local_id), 'Out1']
            local_id += 1
            safety_PLC_FBD += fbd_block_str(
                local_id, 'AND', '',
                [occupied_tvd_addr, not_ignore_tvd_addr], [],
                ['Out1'])
            or_switch_tvds_inputs += [[str(local_id), 'Out1']]
        if len(or_switch_tvds_inputs) == 0:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), 'FALSE')
            switch_tvds_occup_addr = [str(local_id), '']
        elif len(or_switch_tvds_inputs) == 1:
            switch_tvds_occup_addr = [str(local_id), 'Out1']
        else:
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                            or_switch_tvds_inputs, [],
                                            ['Out1'])
            switch_tvds_occup_addr = [str(local_id), 'Out1']

        # Switch manual override
        local_id += 1
        switch_manual_cmd_expr = \
            'var_g.switch_manual_override[SWITCH.' + switch.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id), switch_manual_cmd_expr)
        switch_manual_cmd_addr = [str(local_id), '']

        # Switch locked
        local_id += 1
        or_switch_locked_inputs = [switch_tvds_occup_addr,
                                   switch_manual_cmd_addr]
        safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                        or_switch_locked_inputs, [],
                                        ['Out1'])

        local_id += 1
        switch_locked_expr = 'switch_locked[SWITCH.' + switch.name + ']'
        safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                  [local_id-1, 'Out1'],
                                                  switch_locked_expr)

        for position in ['left', 'right']:
            fbd_page += 1
            local_id = (fbd_page*10000000000)-1

            # Route states
            if position == 'left':
                route_list = switch.required_left_routes
            else:
                route_list = switch.required_right_routes
            or_route_state_inputs = []
            for route_require_pos in route_list:
                local_id += 1
                route_opened_expr = \
                    'route_open[ROUTE.' + route_require_pos.name + ']'
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id), route_opened_expr)
                or_route_state_inputs += [[str(local_id), '']]
            if len(or_route_state_inputs) == 0:
                local_id += 1
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id), 'FALSE')
            elif len(or_route_state_inputs) == 1:
                pass
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_route_state_inputs, [],
                                                ['Out1'])

            local_id += 1
            switch_required_pos_expr = 'switch_required_' + position + '[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                    [local_id-1, 'Out1'],
                                                    switch_required_pos_expr)


    for switch in interlocking.switches.values():
        
        for position in ['left', 'right']:
            fbd_page += 1
            local_id = (fbd_page*10000000000)-1

            local_id += 1
            switch_locked_expr = 'switch_locked[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_locked_expr)
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            [[str(local_id-1), '']], [],
                                            ['Out1'])
            switch_not_locked_addr = [str(local_id), 'Out1']

            local_id += 1
            switch_required_pos_expr = 'switch_required_' + position + '[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id), switch_required_pos_expr)
            pos_required_addr = [str(local_id), '']

            if switch.paired:
                pair = switch.paired[0]
                paired_switch_locked_expr = 'switch_locked[SWITCH.' + pair.name + ']'

                local_id += 1
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id), paired_switch_locked_expr)
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                                [[str(local_id-1), '']], [],
                                                ['Out1'])
                paired_switch_not_locked_addr = [str(local_id), 'Out1']

                if switch.paired[pair] == "left-left":
                    pair_pos_required_expr = 'switch_required_' + position + '[SWITCH.' + pair.name + ']'
                else:
                    pair_pos_required_expr = 'switch_required_' + opposite_sw_pos(position) + '[SWITCH.' + pair.name + ']'

                local_id += 1
                safety_PLC_FBD += fbd_input_variable_str(
                    str(local_id), pair_pos_required_expr)
                paired_pos_required_addr = [str(local_id), '']

                # Switch pair required "or" block
                local_id += 1
                or_switch_req_inputs = [pos_required_addr,
                                        paired_pos_required_addr]
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_switch_req_inputs, [],
                                                ['Out1'])
                or_switch_required_addr = [str(local_id), 'Out1']

                # Switch command "and" block
                local_id += 1
                and_switch_cmd_inputs = [switch_not_locked_addr,
                                         paired_switch_not_locked_addr,
                                         or_switch_required_addr]
                safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                                and_switch_cmd_inputs, [],
                                                ['Out1'])
                
            else: ## Switch unpaired
                # Switch command "and" block
                local_id += 1
                and_switch_cmd_inputs = [pos_required_addr,
                                        switch_not_locked_addr]
                safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                                and_switch_cmd_inputs, [],
                                                ['Out1'])

            local_id += 1
            switch_cmd_expr = \
                'switch_command_' + position + '[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                      [local_id - 1, 'Out1'],
                                                      switch_cmd_expr)

    # Conditions for opening the start signal of a route
    for route in interlocking.routes.values():
        fbd_page += 1
        and_signal_open_conditions = []

        # Route state
        local_id = (fbd_page*10000000000)
        route_opened_expr = 'route_open[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id), route_opened_expr)
        and_signal_open_conditions += [[str(local_id), '']]

        # Route destruction demand
        local_id += 1
        route_destruct_demand_expr =\
            'route_destruction_demand[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id), route_destruct_demand_expr)
        local_id += 1
        safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                        [[str(local_id - 1), '']], [],
                                        ['Out1'])
        and_signal_open_conditions += [[str(local_id), 'Out1']]

        # Switch positions
        and_switch_pos_inputs = []
        for [switch, sw_pos_up] in route.cross_switch + route.require_switch:
            local_id += 1
            sw_pos = sw_pos_up.lower()
            switch_pos_expr = \
                'var_g.switch_detected_' + sw_pos + '[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_pos_expr)
            and_switch_pos_inputs += [[str(local_id), '']]
        if not and_switch_pos_inputs:
            pass
        elif len(and_switch_pos_inputs) == 1:
            and_signal_open_conditions += [[str(local_id), '']]
        else:
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                            and_switch_pos_inputs, [],
                                            ['Out1'])
            and_signal_open_conditions += [[str(local_id), 'Out1']]

        # Switch manual override
        or_switch_manual_cmd_inputs = []
        for [switch, _] in route.cross_switch:
            local_id += 1
            switch_manual_cmd_expr = \
                'var_g.switch_manual_override[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_manual_cmd_expr)
            or_switch_manual_cmd_inputs += [[str(local_id), '']]
        if not or_switch_manual_cmd_inputs:
            pass
        elif len(or_switch_manual_cmd_inputs) == 1:
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            or_switch_manual_cmd_inputs, [],
                                            ['Out1'])
            and_signal_open_conditions += [[str(local_id), 'Out1']]
        else:
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                            or_switch_manual_cmd_inputs, [],
                                            ['Out1'])
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            [[str(local_id - 1), '']], [],
                                            ['Out1'])
            and_signal_open_conditions += [[str(local_id), 'Out1']]

        local_id += 1
        safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                        and_signal_open_conditions, [],
                                        ['Out1'])
        local_id += 1
        route_signal_open_expr =\
            'route_entry_authorization[ROUTE.' + route.name + ']'
        safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                  [local_id - 1, 'Out1'],
                                                  route_signal_open_expr)

    # Signal command
    for signal in interlocking.signals.values():
        start_route = False
        for route in interlocking.routes.values():
            if route.start_signal == signal:
                start_route = True
                break
            
        if start_route:
            fbd_page += 1
            local_id = (fbd_page * 10000000000) - 1

            # Route entry authorizations
            or_diverging_routes = []
            for route in interlocking.routes.values():
                if route.start_signal == signal:
                    local_id += 1
                    route_authorization_expr =\
                        'route_entry_authorization[ROUTE.' + route.name + ']'
                    safety_PLC_FBD += fbd_input_variable_str(
                        str(local_id), route_authorization_expr)
                    or_diverging_routes += [[str(local_id), '']]
            if len(or_diverging_routes) == 1:
                diverging_routes_author_addr = [str(local_id), '']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_diverging_routes, [],
                                                ['Out1'])
                diverging_routes_author_addr = [str(local_id), 'Out1']

            # Route manual closing
            local_id += 1
            route_manual_closing_expr = \
                'var_g.close_command[SIGNAL.' + signal.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), route_manual_closing_expr)
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            [[str(local_id-1), '']], [],
                                            ['Out1'])
            no_manual_closing_addr = [str(local_id), 'Out1']

            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'AND', '',
                                            [diverging_routes_author_addr,
                                            no_manual_closing_addr], [],
                                            ['Out1'])
            local_id += 1
            signal_maneuver_open_expr =\
                'signal_open_maneuver[SIGNAL.' + signal.name + ']'
            safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                    [local_id - 1, 'Out1'],
                                                    signal_maneuver_open_expr)

    
    cur_time = time.localtime()
    creation_date_time_str = '{}-{:0>2}-{:0>2}T{:0>2}:{:0>2}:{:0>2}'\
                             .format(cur_time.tm_year,
                                     cur_time.tm_mon,
                                     cur_time.tm_mday,
                                     cur_time.tm_hour,
                                     cur_time.tm_min,
                                     cur_time.tm_sec)
    project_name_str = interlocking.name

    tc_enum_values_str = ''
    for tc in interlocking.tvds:
        tc_enum_val = interlocking.tvds[tc].enum_val
        tc_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(tc, tc_enum_val)
    # TODO Utiliser les noms donnés (si uniques)

    switch_enum_values_str = ''
    for switch in interlocking.switches:
        switch_enum_val = interlocking.switches[switch].enum_val
        switch_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(switch, switch_enum_val)

    signal_enum_values_str = ''
    for sig in interlocking.signals:
        sig_enum_val = interlocking.signals[sig].enum_val
        signal_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(sig, sig_enum_val)

    route_enum_values_str = ''
    for route in interlocking.routes:
        route_enum_val = interlocking.routes[route].enum_val
        route_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(route, route_enum_val)

    delay_destruct_values_str = ''
    for route in interlocking.routes.values():
        if route.delay_destruct == 'Inf':
            route_delay_destruct = 'TIME#99999s0ms'
        else:
            route_delay_destruct = 'TIME#' + route.delay_destruct + 's0ms'
        delay_destruct_values_str +=\
            '                  <value>\n' \
            '                    <simpleValue value="{}" />\n' \
            '                  </value>\n'.format(route_delay_destruct)

    plc_period_str = 'PT' + str(interlocking.period/1000) + 'S'
    n_tvd_str = str(len(interlocking.tvds))
    n_route_str = str(len(interlocking.routes))
    n_switch_str = str(len(interlocking.switches))
    n_signal_str = str(len(interlocking.signals))

    with open(openplc_mold, 'r') as mold:
        openplc_mold_str = mold.read()
        complete_file_str = openplc_mold_str.format(
            creation_date_time=creation_date_time_str,
            project_name=project_name_str,
            tc_enum_values=tc_enum_values_str,
            switch_enum_values=switch_enum_values_str,
            signal_enum_values=signal_enum_values_str,
            route_enum_values=route_enum_values_str,
            delay_destruct_values=delay_destruct_values_str,
            safety_PLC_FBD=safety_PLC_FBD,
            plc_period=plc_period_str,
            n_tvd=n_tvd_str,
            n_route=n_route_str,
            n_switch=n_switch_str,
            n_signal=n_signal_str
        )

    with open(openplc_file_path, 'w') as f:
        f.write(complete_file_str)


def generate_plc_program(xml_file, PLC_period, openplc_mold, openplc_file_path):
    interlocking = xml_to_python(xml_file)
    interlocking.period = int(PLC_period)
    python_to_openplc(interlocking, openplc_mold, openplc_file_path)


if __name__ == '__main__':
    XML_file_path = sys.argv[1]
    PLC_period = sys.argv[2]  # in ms
    openplc_mold = sys.argv[3]
    openplc_file_path = sys.argv[4]
    generate_plc_program(XML_file_path,
                         PLC_period,
                         openplc_mold,
                         openplc_file_path)
