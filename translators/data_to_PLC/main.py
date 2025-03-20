import sys
import xml.etree.ElementTree as ET
import time


def is_number(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


class Route:
    def __init__(self, name, enum_val):
        self.name = name
        self.enum_val = enum_val
        self.intermediate_segment = []
        self.incompatible_route = []
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

    nTC = 0
    for tvd_elem in root.findall("./assetsForIL/tvdSections/tvdSection"):
        nTC += 1
        tvd_dict[tvd_elem.get("id")] = Tvd(tvd_elem.get("id"), nTC)
        tvd_elem_dict[tvd_elem.get("id")] = tvd_elem

    nSeg = 0
    for segment_elem in root.findall("./assetsForIL/segments/segment"):
        nSeg += 1
        segment_dict[segment_elem.get("id")] = Segment(segment_elem.get("id"), nSeg)

    # second pass: making the links
    #for route_elem in root.findall("./assetsForIL/routes/route"):
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
            route_obj.cross_switch +=\
                [switch_dict[cross_switch_elem.get("ref")],
                 cross_switch_elem.get("pos")]

        for require_switch_elem in route_elem.findall("requireSwitch"):
            route_obj.require_switch +=\
                [switch_dict[require_switch_elem.get("ref")],
                 require_switch_elem.get("pos")]

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

    #for signal_elem in root.findall("./assetsForIL/signalsIL/signalIL"):
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

    #for switch_elem in root.findall("./assetsForIL/switchesIL/switchIL"):
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

    #for segment_elem in root.findall("./assetsForIL/segments/segment"):
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

    interlocking.nTC = nTC
    interlocking.nSeg = nSeg
    interlocking.nRoute = nRoute
    interlocking.nSwitch = nSwitch
    interlocking.nSignal = nSignal
    interlocking.nClosedSignal = nClosedSignal
    interlocking.nRouteStatic = nRouteStatic
    return interlocking


def python_to_openplc(interlocking, openplc_mold, openplc_file_path):
    cur_time = time.localtime()
    creationDateTime = '{}-{:0>2}-{:0>2}T{:0>2}:{:0>2}:{:0>2}'\
                       .format(cur_time.tm_year,
                               cur_time.tm_mon,
                               cur_time.tm_mday,
                               cur_time.tm_hour,
                               cur_time.tm_min,
                               cur_time.tm_sec)
    projectName = interlocking.name

    tcEnumValues = ''
    for tc in interlocking.tvds:
        tc_enum_val = interlocking.tvds[tc].enum_val
        tcEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(tc, tc_enum_val)

    switchEnumValues = ''
    for switch in interlocking.switches:
        switch_enum_val = interlocking.switches[switch].enum_val
        switchEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(switch, switch_enum_val)

    signalEnumValues = ''
    for sig in interlocking.signals:
        sig_enum_val = interlocking.signals[sig].enum_val
        signalEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(sig, sig_enum_val)

    closedSignalEnumValues = ''
    for closed_sig in interlocking.closed_signals:
        closed_sig_enum_val = interlocking.closed_signals[closed_sig].enum_val
        closedSignalEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(closed_sig, closed_sig_enum_val)

    routeEnumValues = ''
    for route in interlocking.routes:
        route_enum_val = interlocking.routes[route].enum_val
        routeEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(route, route_enum_val)

    staticRouteEnumValues = ''
    for static_route in interlocking.static_routes:
        static_route_enum_val = interlocking.static_routes[static_route].enum_val
        staticRouteEnumValues +=\
            '              <value name="{}" value="{}" />\n'\
            .format(static_route, static_route_enum_val)

    delayDestructValues = ''
    for route in interlocking.routes.values():
        if route.delay_destruct == 'Inf':
            route_delay_destruct = 'TIME#99999s0ms'
        else:
            route_delay_destruct = 'TIME#' + route.delay_destruct + 's0ms'
        delayDestructValues +=\
            '                  <value>\n' \
            '                    <simpleValue value="{}" />\n' \
            '                  </value>\n'.format(route_delay_destruct)

    bla = ''


def generate_plc_program(xml_file, openplc_mold, openplc_file_path):
    interlocking = xml_to_python(xml_file)
    python_to_openplc(interlocking, openplc_mold, openplc_file_path)


if __name__ == '__main__':
    XML_file_path = sys.argv[1]
    openplc_mold = sys.argv[2]
    openplc_file_path = sys.argv[3]
    generate_plc_program(XML_file_path, openplc_mold, openplc_file_path)
