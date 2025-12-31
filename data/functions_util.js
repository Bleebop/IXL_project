
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

export {opp_dir, get_seg_point, intToBits, bitsToInt, getBitArray, getUintArray, check_coll};

