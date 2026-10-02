import sys
import xml.etree.ElementTree as ET
import time
import os
import railml_to_python


HLL_mold =\
'Types:\n'\
'    \n'\
'    enum {tvd_enum} TC_t;\n'\
'    \n'\
'    enum {sig_enum} Sig_t;\n'\
'    \n'\
'    enum {switch_enum} Sw_t;\n'\
'    \n'\
'    enum {route_enum} Route_t;\n'\
'\n'\
'Declarations:\n'\
'    \n'\
'    // Data\n'\
'    bool incompatible_routes(Route_t, Route_t);\n'\
'    bool transit_TC(Route_t, TC_t);\n'\
'    bool approach_area(Route_t, TC_t);\n'\
'    Sig_t origin_signal(Route_t);\n'\
'    int unsigned 20 delay_destruct(Route_t);\n'\
'    bool route_require_sw_pos(Route_t, Sw_t, Sw_pos_t);\n'\
'    bool switch_on_TC(Sw_t, TC_t);\n'\
'    bool paired_switches(Sw_t, Sw_t);\n'\
'\n'\
'Definitions:\n'\
'\n'\
'    incompatible_routes(route_1, route_2) :=\n'\
'        (route_1, route_2\n'\
'{incompatible_routes}'\
'        |_,_ => False\n'\
'        );\n\n'\
'    transit_TC(route, tc) :=\n'\
'        (route, tc\n'\
'{transit_tvd}'\
'        |_,_ => False\n'\
'        );\n\n'\
'    approach_area(route, tc) :=\n'\
'        (route, tc\n'\
'{approach_area}'\
'        |_,_ => False\n'\
'        );\n\n'\
'    origin_signal(route) :=\n'\
'        (route\n'\
'{origin_signal}'\
'        );\n\n'\
'    // in ms\n'\
'    delay_destruct(route) :=\n'\
'        (route\n'\
'{delay_destruct}'\
'        );\n\n'\
'    route_require_sw_pos(route, sw, pos) :=\n'\
'        (route, sw, pos\n'\
'{route_require_sw_pos}'\
'        |_,_,_ => False\n'\
'        );\n\n'\
'    switch_on_TC(sw, tc) :=\n'\
'        (sw, tc\n'\
'{switch_on_tvd}'\
'        |_,_ => False\n'\
'        );\n\n'\
'    paired_switches(sw_1, sw_2) :=\n'\
'        (sw_1, sw_2\n'\
'{paired_switches}'\
'        |_,_ => False\n'\
'        );\n\n'\
'\n'


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


def python_to_hll(interlocking, hll_file_path):

    ## Enums
    tvd_enum_str = ' {\n'
    for tvd in interlocking.tvds.values():
        tvd_enum_str += '        ' + tvd.name + ',\n'
    tvd_enum_str = tvd_enum_str[:-2] + '\n    } '
    sig_enum_str = ' {\n'
    for signal in interlocking.signals.values():
        sig_enum_str += '        ' + signal.name + ',\n'
    sig_enum_str = sig_enum_str[:-2] + '\n    } '
    switch_enum_str = ' {\n'
    for switch in interlocking.switches.values():
        switch_enum_str += '        ' + switch.name + ',\n'
    switch_enum_str = switch_enum_str[:-2] + '\n    } '
    route_enum_str = ' {\n'
    for route in interlocking.routes.values():
        route_enum_str += '        ' + route.name + ',\n'
    route_enum_str = route_enum_str[:-2] + '\n    } '

    ## Data
    incompatible_routes_str = ''
    for route in interlocking.routes.values():
        for incompt_route in route.incompatible_route:
            incompatible_routes_str += \
                '        |{}, {} => True\n'\
                .format(route.name, incompt_route.name)
        incompatible_routes_str += '\n'

    transit_tvd_str = ''
    for route in interlocking.routes.values():
        for transit_tvd in route.tvds[:-1]:
            transit_tvd_str += \
                '        |{}, {} => True\n'\
                .format(route.name, transit_tvd.name)
        transit_tvd_str += '\n'

    approach_area_str = ''
    for route in interlocking.routes.values():
        for approach_tvd in route.approach_area:
            approach_area_str += \
                '        |{}, {} => True\n'\
                .format(route.name, approach_tvd.name)
        approach_area_str += '\n'

    origin_signal_str = ''
    for route in interlocking.routes.values():
        origin_signal_str += \
            '        |{} => {}\n'\
            .format(route.name, route.start_signal.name)

    delay_destruct_str = ''
    for route in interlocking.routes.values():
        if route.delay_destruct == 'Inf':
            route_delay_destruct = '0' # TODO manage when there's no delay
        else:
            route_delay_destruct = str(int(route.delay_destruct)*1000)
        delay_destruct_str += \
            '        |{} => {}\n'\
            .format(route.name, route_delay_destruct)

    route_require_sw_pos_str = ''
    for route in interlocking.routes.values():
        for switch_pos in route.require_switch:
            route_require_sw_pos_str += \
                '        |{}, {}, {} => True\n'\
                .format(route.name, switch_pos[0].name, switch_pos[1])
        route_require_sw_pos_str += '\n'

    switch_on_tvd_str = ''
    for switch in interlocking.switches.values():
        for tvd in switch.fouling_point_tvd:
            switch_on_tvd_str += \
                '        |{}, {} => True\n'\
                .format(switch.name, tvd.name)
        switch_on_tvd_str += '\n'

    paired_switches_str = ''
    for switch in interlocking.switches.values():
        paired_switches_str += \
            '        |{}, {} => True\n'\
            .format(switch.name, switch.paired[0].name)

    complete_file_str = HLL_mold.format(
        tvd_enum=tvd_enum_str,
        sig_enum=sig_enum_str,
        switch_enum=switch_enum_str,
        route_enum=route_enum_str,
        incompatible_routes=incompatible_routes_str,
        transit_tvd=transit_tvd_str,
        approach_area=approach_area_str,
        origin_signal=origin_signal_str,
        delay_destruct=delay_destruct_str,
        route_require_sw_pos=route_require_sw_pos_str,
        switch_on_tvd=switch_on_tvd_str,
        paired_switches=paired_switches_str
    )

    with open(hll_file_path, 'w') as f:
            f.write(complete_file_str)

def generate_hll_program(xml_file, hll_file_path):
    interlocking = railml_to_python.xml_to_python(xml_file)
    python_to_hll(interlocking, hll_file_path)


if __name__ == '__main__':
    XML_file_path = sys.argv[1]
    hll_file_path = sys.argv[2]
    generate_hll_program(XML_file_path,
                         hll_file_path)
