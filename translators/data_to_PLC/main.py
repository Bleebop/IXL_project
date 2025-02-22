import sys
import xml.etree.ElementTree as ET


class Route:
    def __init__(self, name):
        self.name = name
        self.intermediate_segment = []
        self.incompatible_route = []
        self.cross_switch = []
        self.require_switch = []


class Signal:
    def __init__(self, name):
        self.name = name
        self.is_always_closed = False
        self.approach_area = []


class Switch:
    def __init__(self, name):
        self.name = name
        self.paired = []
        self.fouling_point_segments = []


class Tvd:
    def __init__(self, name):
        self.name = name


class Segment:
    def __init__(self, name):
        self.name = name


def generate_plc_program(xml_file):
    data_tree = ET.parse(xml_file)
    root = data_tree.getroot()

    route_dict = {}
    signal_dict = {}
    switch_dict = {}
    tvd_dict = {}
    segment_dict = {}

    # first pass: creating all the instances
    for route_elem in root.findall("./assetsForIL/routes/route"):
        route_dict[route_elem.get("id")] = Route(route_elem.get("id"))
    for signal_elem in root.findall("./assetsForIL/signalsIL/signalIL"):
        signal_dict[signal_elem.get("id")] = Signal(signal_elem.get("id"))
    for switch_elem in root.findall("./assetsForIL/switchesIL/switchIL"):
        switch_dict[switch_elem.get("id")] = Switch(switch_elem.get("id"))
    for tvd_elem in root.findall("./assetsForIL/tvdSections/tvdSection"):
        tvd_dict[tvd_elem.get("id")] = Tvd(tvd_elem.get("id"))
    for segment_elem in root.findall("./assetsForIL/segments/segment"):
        segment_dict[segment_elem.get("id")] = Segment(segment_elem.get("id"))

    # second pass: making the links
    for route_elem in root.findall("./assetsForIL/routes/route"):
        route_name = route_elem.get("id")
        route_obj = route_dict[route_name]

        start_sig_elem = route_elem.find("./startSignal")
        if start_sig_elem:
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

    for signal_elem in root.findall("./assetsForIL/signalsIL/signalIL"):
        signal_name = signal_elem.get("id")
        signal_obj = signal_dict[signal_name]

        if signal_elem.get("isAlwaysClosed") == "True":
            signal_obj.is_always_closed = True

        previous_seg_elem = signal_elem.find("./previousSegment")
        if previous_seg_elem:
            signal_obj.previous_seg =\
                segment_dict[previous_seg_elem.get("ref")]
            signal_obj.prev_seg_dir = \
                previous_seg_elem.get("dir")

        next_seg_elem = signal_elem.find("./nextSegment")
        if next_seg_elem:
            signal_obj.next_seg =\
                segment_dict[next_seg_elem.get("ref")]
            signal_obj.next_seg_dir = \
                next_seg_elem.get("dir")

        for approach_seg_elem in signal_elem.findall("approachArea"):
            signal_obj.approach_area +=\
                [segment_dict[approach_seg_elem.get("ref")]]

    for switch_elem in root.findall("./assetsForIL/switchesIL/switchIL"):
        switch_name = switch_elem.get("id")
        switch_obj = switch_dict[switch_name]

        for paired_switch_elem in switch_elem.findall("pairedSw"):
            switch_obj.paired +=\
                [[switch_dict[paired_switch_elem.get("ref")],
                  switch_dict[paired_switch_elem.get("corresp")]]]

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

    for segment_elem in root.findall("./assetsForIL/segments/segment"):
        segment_name = segment_elem.get("id")
        segment_obj = segment_dict[segment_name]

        containing_tvd_elem = segment_elem.find("./containingTvd")
        if containing_tvd_elem:
            segment_obj.containing_tvd =\
                tvd_dict[containing_tvd_elem.get("ref")]

        next_up_right_elem = segment_elem.find("./nextSegUpRight")
        if next_up_right_elem:
            if next_up_right_elem.get("nextDir") == "Up":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_up_right =\
                [segment_dict[next_up_right_elem.get("ref")], polarity_change]

        next_up_left_elem = segment_elem.find("./nextSegUpLeft")
        if next_up_left_elem:
            if next_up_right_elem.get("nextDir") == "Up":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_up_left =\
                [segment_dict[next_up_left_elem.get("ref")], polarity_change]

        next_down_right_elem = segment_elem.find("./nextSegDownRight")
        if next_down_right_elem:
            if next_up_right_elem.get("nextDir") == "Down":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_down_right =\
                [segment_dict[next_down_right_elem.get("ref")], polarity_change]

        next_down_left_elem = segment_elem.find("./nextSegDownLeft")
        if next_down_left_elem:
            if next_up_right_elem.get("nextDir") == "Down":
                polarity_change = False
            else:
                polarity_change = True
            segment_obj.next_down_left =\
                [segment_dict[next_down_left_elem.get("ref")], polarity_change]


if __name__ == '__main__':
    XML_file_path = sys.argv[1]
    generate_plc_program(XML_file_path)
