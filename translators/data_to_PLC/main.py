import sys
import xml.etree.ElementTree as ET
import time


def is_number(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


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


class Route:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val
        self.intermediate_segment = []
        self.tvds = []
        self.incompatible_route = []
        self.start_signal = None
        self.cross_switch = []
        self.require_switch = []
        self.delay_destruct = "Inf"
        self.is_entry_route = False
        self.is_exit_route = False


class StaticRoute:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val
        self.intermediate_segment = []
        self.is_entry_route = False
        self.is_exit_route = False


class Signal:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val
        self.approach_area = []


class ClosedSignal:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val


class Switch:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val
        self.paired = []
        self.fouling_point_segments = []
        self.required_left_routes = []
        self.required_right_routes = []


class Tvd:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val


class Segment:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val


class Interlocking:
    def __init__(self, name, routes, static_routes, signals, closed_signals,
                 switches, tvds, segments):
        self.name = name
        self.period = 100  # ms
        self.routes = routes
        self.static_routes = static_routes
        self.signals = signals
        self.closed_signals = closed_signals
        self.switches = switches
        self.tvds = tvds
        self.segments = segments


def xml_to_python(xml_file):
    data_tree = ET.parse(xml_file)
    root = data_tree.getroot()

    route_dict = {}
    static_route_dict = {}
    signal_dict = {}
    closed_signal_dict = {}
    switch_dict = {}
    tvd_dict = {}
    segment_dict = {}

    route_elem_dict = {}
    static_route_elem_dict = {}
    signal_elem_dict = {}
    closed_signal_elem_dict = {}
    switch_elem_dict = {}
    tvd_elem_dict = {}
    segment_elem_dict = {}

    interlocking = Interlocking(root.get("id"),
                                route_dict,
                                static_route_dict,
                                signal_dict,
                                closed_signal_dict,
                                switch_dict,
                                tvd_dict,
                                segment_dict)

    # first pass: creating all the instances
    nRoute = 0
    nRouteStatic = 0
    for route_elem in root.findall("./assetsForIL/routes/route"):
        if route_elem.get("isNeverClosed") == "True":
            nRouteStatic += 1
            static_route_dict[route_elem.get("id")] =\
                StaticRoute(route_elem.get("id"), nRouteStatic)
            static_route_elem_dict[route_elem.get("id")] = route_elem
        else:
            nRoute += 1
            route_dict[route_elem.get("id")] =\
                Route(route_elem.get("id"), nRoute)
            route_elem_dict[route_elem.get("id")] = route_elem

    nSignal = 0
    nClosedSignal = 0
    for signal_elem in root.findall("./assetsForIL/signalsIL/signalIL"):
        if signal_elem.get("isAlwaysClosed") == "True":
            nClosedSignal += 1
            closed_signal_dict[signal_elem.get("id")] =\
                ClosedSignal(signal_elem.get("id"), nClosedSignal)
            closed_signal_elem_dict[signal_elem.get("id")] = signal_elem
        else:
            nSignal += 1
            signal_dict[signal_elem.get("id")] =\
                Signal(signal_elem.get("id"), nSignal)
            signal_elem_dict[signal_elem.get("id")] = signal_elem

    nSwitch = 0
    for switch_elem in root.findall("./assetsForIL/switchesIL/switchIL"):
        nSwitch += 1
        switch_dict[switch_elem.get("id")] = Switch(switch_elem.get("id"), nSwitch)
        switch_elem_dict[switch_elem.get("id")] = switch_elem

    nTVD = 0
    for tvd_elem in root.findall("./assetsForIL/tvdSections/tvdSection"):
        nTVD += 1
        tvd_dict[tvd_elem.get("id")] = Tvd(tvd_elem.get("id"), nTVD)
        tvd_elem_dict[tvd_elem.get("id")] = tvd_elem

    nSeg = 0
    for segment_elem in root.findall("./assetsForIL/segments/segment"):
        nSeg += 1
        segment_dict[segment_elem.get("id")] = Segment(segment_elem.get("id"), nSeg)
        segment_elem_dict[segment_elem.get("id")] = segment_elem

    # second pass: making the links
    for route_elem in route_elem_dict.values():
        route_name = route_elem.get("id")
        route_obj = route_dict[route_name]

        if route_elem.get("isExitRoute") == "True":
            route_obj.is_exit_route = True
        if route_elem.get("isEntryRoute") == "True":
            route_obj.is_entry_route = True

        route_delay_destruct = route_elem.get("delayDestruct")
        if route_delay_destruct == "Inf":
            route_obj.delay_destruct = route_delay_destruct
        elif is_number(route_delay_destruct):
            route_obj.delay_destruct = route_delay_destruct
        else:
            route_obj.delay_destruct = "Inf"

        start_sig_elem = route_elem.find("./startSignal")
        if start_sig_elem is not None:
            route_obj.start_signal =\
                signal_dict[start_sig_elem.get("ref")]

        start_seg_elem = route_elem.find("./startSegment")
        route_obj.start_segment =\
            [segment_dict[start_seg_elem.get("ref")],
             start_seg_elem.get("dir")]

        for inter_seg_elem in route_elem.findall("intermediateSegment"):
            route_obj.intermediate_segment +=\
                [segment_dict[inter_seg_elem.get("ref")]]

        dest_seg_elem = route_elem.find("./destinationSegment")
        route_obj.destination_segment =\
            segment_dict[dest_seg_elem.get("ref")]

        for incomp_route_elem in route_elem.findall("incompatibleRoute"):
            route_obj.incompatible_route +=\
                [route_dict[incomp_route_elem.get("ref")]]

        for cross_switch_elem in route_elem.findall("crossSwitch"):
            switch_obj = switch_dict[cross_switch_elem.get("ref")]
            required_pos = cross_switch_elem.get("pos")
            route_obj.cross_switch +=\
                [[switch_obj, required_pos]]
            if required_pos == 'Left':
                switch_obj.required_left_routes += [route_obj]
            elif required_pos == 'Right':
                switch_obj.required_right_routes += [route_obj]

        for require_switch_elem in route_elem.findall("requireSwitch"):
            switch_obj = switch_dict[require_switch_elem.get("ref")]
            required_pos = require_switch_elem.get("pos")
            route_obj.require_switch +=\
                [[switch_obj, required_pos]]
            if required_pos == 'Left':
                switch_obj.required_left_routes += [route_obj]
            elif required_pos == 'Right':
                switch_obj.required_right_routes += [route_obj]

    for static_route_elem in static_route_elem_dict.values():
        static_route_name = static_route_elem.get("id")
        static_route_obj = static_route_dict[static_route_name]

        if static_route_elem.get("isExitRoute") == "True":
            static_route_obj.is_exit_route = True
        if static_route_elem.get("isEntryRoute") == "True":
            static_route_obj.is_entry_route = True

        start_seg_elem = static_route_elem.find("./startSegment")
        static_route_obj.start_segment = \
            [segment_dict[start_seg_elem.get("ref")],
             start_seg_elem.get("dir")]

        for inter_seg_elem in static_route_elem.findall("intermediateSegment"):
            static_route_obj.intermediate_segment += \
                [segment_dict[inter_seg_elem.get("ref")]]

        dest_seg_elem = static_route_elem.find("./destinationSegment")
        static_route_obj.destination_segment = \
            segment_dict[dest_seg_elem.get("ref")]

    for signal_elem in signal_elem_dict.values():
        signal_name = signal_elem.get("id")
        signal_obj = signal_dict[signal_name]

        previous_seg_elem = signal_elem.find("./previousSegment")
        if previous_seg_elem is not None:
            signal_obj.previous_seg =\
                segment_dict[previous_seg_elem.get("ref")]
            signal_obj.prev_seg_dir = \
                previous_seg_elem.get("dir")

        next_seg_elem = signal_elem.find("./nextSegment")
        if next_seg_elem is not None:
            signal_obj.next_seg =\
                segment_dict[next_seg_elem.get("ref")]
            signal_obj.next_seg_dir = \
                next_seg_elem.get("dir")

        for approach_seg_elem in signal_elem.findall("approachArea"):
            signal_obj.approach_area +=\
                [segment_dict[approach_seg_elem.get("ref")]]

    for closed_signal_elem in closed_signal_elem_dict.values():
        closed_signal_name = closed_signal_elem.get("id")
        closed_signal_obj = closed_signal_dict[closed_signal_name]

        previous_seg_elem = closed_signal_elem.find("./previousSegment")
        if previous_seg_elem is not None:
            closed_signal_obj.previous_seg =\
                segment_dict[previous_seg_elem.get("ref")]
            closed_signal_obj.prev_seg_dir = \
                previous_seg_elem.get("dir")

        next_seg_elem = closed_signal_elem.find("./nextSegment")
        if next_seg_elem is not None:
            closed_signal_obj.next_seg =\
                segment_dict[next_seg_elem.get("ref")]
            closed_signal_obj.next_seg_dir = \
                next_seg_elem.get("dir")

    for switch_elem in switch_elem_dict.values():
        switch_name = switch_elem.get("id")
        switch_obj = switch_dict[switch_name]

        for paired_switch_elem in switch_elem.findall("pairedSw"):
            switch_obj.paired +=\
                [[switch_dict[paired_switch_elem.get("ref")],
                  paired_switch_elem.get("corresp")]]

        left_seg_elem = switch_elem.find("./leftSegment")
        switch_obj.left_segment = \
            segment_dict[left_seg_elem.get("ref")]

        right_seg_elem = switch_elem.find("./rightSegment")
        switch_obj.right_segment = \
            segment_dict[right_seg_elem.get("ref")]

        tip_seg_elem = switch_elem.find("./tipSegment")
        switch_obj.tip_segment = \
            segment_dict[tip_seg_elem.get("ref")]

        for fouling_seg_elem in switch_elem.findall("isInFoulingPoint"):
            switch_obj.fouling_point_segments +=\
                [segment_dict[fouling_seg_elem.get("ref")]]

    for segment_elem in segment_elem_dict.values():
        segment_name = segment_elem.get("id")
        segment_obj = segment_dict[segment_name]

        containing_tvd_elem = segment_elem.find("./containingTvd")
        if containing_tvd_elem is not None:
            segment_obj.containing_tvd =\
                tvd_dict[containing_tvd_elem.get("ref")]

        next_up_right_elem = segment_elem.find("./nextSegUpRight")
        if next_up_right_elem is not None:
            if next_up_right_elem.get("nextDir") == "Up":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_up_right =\
                [segment_dict[next_up_right_elem.get("ref")], polarity_change]

        next_up_left_elem = segment_elem.find("./nextSegUpLeft")
        if next_up_left_elem is not None:
            if next_up_left_elem.get("nextDir") == "Up":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_up_left =\
                [segment_dict[next_up_left_elem.get("ref")], polarity_change]

        next_down_right_elem = segment_elem.find("./nextSegDownRight")
        if next_down_right_elem is not None:
            if next_down_right_elem.get("nextDir") == "Down":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_down_right =\
                [segment_dict[next_down_right_elem.get("ref")], polarity_change]

        next_down_left_elem = segment_elem.find("./nextSegDownLeft")
        if next_down_left_elem is not None:
            if next_down_left_elem.get("nextDir") == "Down":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_down_left =\
                [segment_dict[next_down_left_elem.get("ref")], polarity_change]

    for route in interlocking.routes.values():
        routes_tvds = [route.start_segment[0].containing_tvd]
        for seg in route.intermediate_segment:
            if seg.containing_tvd != routes_tvds[-1]:
                routes_tvds += [seg.containing_tvd]
        if route.destination_segment.containing_tvd != routes_tvds[-1]:
            routes_tvds += [route.destination_segment.containing_tvd]
            # TODO better way to avoid duplicates
        route.tvds = routes_tvds

    interlocking.nTVD = nTVD
    interlocking.nSeg = nSeg
    interlocking.nRoute = nRoute
    interlocking.nSwitch = nSwitch
    interlocking.nSignal = nSignal
    interlocking.nClosedSignal = nClosedSignal
    interlocking.nRouteStatic = nRouteStatic
    return interlocking


def python_to_openplc(interlocking, openplc_mold, openplc_file_path):

    safety_PLC_FBD = ''
    fbd_page = 0
    for route_name in interlocking.routes:
        fbd_page += 1
        # Route formation demand
        route = interlocking.routes[route_name]
        local_id = (fbd_page*10000000000)
        route_formation_demand_expr =\
            'var_g.route_formation_demand[ROUTE.' + route_name + ']'
        safety_PLC_FBD += fbd_input_variable_str(
            str(local_id),
            route_formation_demand_expr)
        route_formation_demand_addr = [str(local_id), '']

        # Incompatible routes demands
        if not route.incompatible_route:  # Use a static route instead...
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
        if not route.incompatible_route:  # Use a static route instead...
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
            'PLC_not_safety.route_destruction_demand[ROUTE.' + route_name + ']'
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
            for tvd in route.tvds[1:-1]:
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
        if not route.start_signal or not route.start_signal.approach_area:
            local_id += 1
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), 'TRUE')
            # TODO parametrize what to do when no approach area/start signal
            approach_area_occupied_addr = [str(local_id), '']
        else:
            approach_tvds = []
            for seg in route.start_signal.approach_area:
                if (not approach_tvds or
                        approach_tvds[-1] != seg.containing_tvd):
                    approach_tvds += [seg.containing_tvd]
                # TODO better way to avoid duplicates

            or_approach_area_inputs = []
            for tvd in approach_tvds:
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

    for switch_name in interlocking.switches:
        switch = interlocking.switches[switch_name]

        # Switch locked
        fbd_page += 1
        local_id = (fbd_page*10000000000)-1

        # Switch TVDs occupation
        switch_tvds = []
        for seg in switch.fouling_point_segments:
            if (not switch_tvds or
                    seg.containing_tvd != switch_tvds[-1]):
                switch_tvds += [seg.containing_tvd]
            # TODO better way to avoid duplicates

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
        if len(or_switch_tvds_inputs) == 1:
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
            if len(or_route_state_inputs) == 1:
                pos_required_addr = [str(local_id), '']
            else:
                local_id += 1
                safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                                or_route_state_inputs, [],
                                                ['Out1'])
                pos_required_addr = [str(local_id), 'Out1']

            local_id += 1
            switch_locked_expr = 'switch_locked[SWITCH.' + switch.name + ']'
            safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), switch_locked_expr)
            local_id += 1
            safety_PLC_FBD += fbd_block_str(local_id, 'NOT', '',
                                            [[str(local_id-1), '']], [],
                                            ['Out1'])
            switch_not_locked_addr = [str(local_id), 'Out1']

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
    for route_name in interlocking.routes:
        fbd_page += 1
        route = interlocking.routes[route_name]
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
            'PLC_not_safety.route_destruction_demand[ROUTE.' + route.name + ']'
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
    for signal_name in interlocking.signals:
        fbd_page += 1
        local_id = (fbd_page * 10000000000) - 1
        signal = interlocking.signals[signal_name]

        # Route entry authorizations
        or_diverging_routes = []
        for route_name in interlocking.routes:
            route = interlocking.routes[route_name]
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


    non_safety_PLC_FBD = ''
    fbd_page = 0
    for route_name in interlocking.routes:
        route = interlocking.routes[route_name]
        fbd_page += 1

        # Auto-destruct inputs
        auto_destruct_inputs = []
        local_id = (fbd_page*10000000000)
        route_open_expr =\
            'PLC_safety.route_open[ROUTE.' + route_name + ']'
        non_safety_PLC_FBD += fbd_input_variable_str(
            str(local_id), route_open_expr)
        auto_destruct_inputs += [[str(local_id), '']]

        # final TVDs occupation
        for tvd in route.tvds[-2:]:
            local_id += 1
            tvd_occupied_expr = \
                'var_g.TC_occupied[TC.' + tvd.name + ']'
            non_safety_PLC_FBD += fbd_input_variable_str(
                str(local_id), tvd_occupied_expr)
            auto_destruct_inputs += [[str(local_id), '']]

        local_id += 1
        auto_destruct_inst_name = 'AUTO_DESTRUCT[ROUTE.' + route_name + ']'
        auto_destruct_input_name_list = ['route_open',
                                         'last_TTD_occupied',
                                         'destination_TTD_occupied']
        non_safety_PLC_FBD += fbd_block_str(local_id, 'AUTO_DESTRUCT',
                                            auto_destruct_inst_name,
                                            auto_destruct_inputs,
                                            auto_destruct_input_name_list,
                                            ['route_auto_destruct_command'])
        route_auto_destruct_command_addr = \
            [local_id, 'route_auto_destruct_command']

        local_id += 1
        route_manual_dest_cmd_expr = \
            'var_g.route_destruct_manual_demand[ROUTE.' + route.name + ']'
        non_safety_PLC_FBD += fbd_input_variable_str(
            str(local_id), route_manual_dest_cmd_expr)

        local_id += 1
        non_safety_PLC_FBD += fbd_block_str(local_id, 'OR', '',
                                            [route_auto_destruct_command_addr,
                                             [str(local_id-1), '']],
                                            [],
                                            ['Out1'])
        local_id += 1
        route_destruct_cmd =\
            'route_destruction_demand[ROUTE.' + route.name + ']'
        non_safety_PLC_FBD += fbd_output_variable_str(local_id,
                                                      [local_id - 1, 'Out1'],
                                                      route_destruct_cmd)
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

    closed_signal_enum_values_str = ''
    for closed_sig in interlocking.closed_signals:
        closed_sig_enum_val = interlocking.closed_signals[closed_sig].enum_val
        closed_signal_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(closed_sig, closed_sig_enum_val)

    route_enum_values_str = ''
    for route in interlocking.routes:
        route_enum_val = interlocking.routes[route].enum_val
        route_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(route, route_enum_val)

    static_route_enum_values_str = ''
    for static_route in interlocking.static_routes:
        static_route_enum_val = interlocking.static_routes[static_route].enum_val
        static_route_enum_values_str +=\
            '              <value name="{}" value="{}" />\n'\
            .format(static_route, static_route_enum_val)

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
    n_tvd_str = str(interlocking.nTVD)
    n_route_str = str(interlocking.nRoute)
    n_switch_str = str(interlocking.nSwitch)
    n_signal_str = str(interlocking.nSignal)
    n_closed_signal_str = str(interlocking.nClosedSignal)
    n_static_route_str = str(interlocking.nRouteStatic)

    with open(openplc_mold, 'r') as mold:
        openplc_mold_str = mold.read()
        complete_file_str = openplc_mold_str.format(
            creation_date_time=creation_date_time_str,
            project_name=project_name_str,
            tc_enum_values=tc_enum_values_str,
            switch_enum_values=switch_enum_values_str,
            signal_enum_values=signal_enum_values_str,
            closed_signal_enum_values=closed_signal_enum_values_str,
            route_enum_values=route_enum_values_str,
            static_route_enum_values=static_route_enum_values_str,
            delay_destruct_values=delay_destruct_values_str,
            non_safety_PLC_FBD=non_safety_PLC_FBD,
            safety_PLC_FBD=safety_PLC_FBD,
            plc_period=plc_period_str,
            n_tvd=n_tvd_str,
            n_route=n_route_str,
            n_switch=n_switch_str,
            n_signal=n_signal_str,
            n_closed_signal=n_closed_signal_str,
            n_static_route=n_static_route_str
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
