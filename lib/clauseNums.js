"use strict";

exports.iterator = function () {
  var ids = [];
  var inAnnex = false;
  var currentLevel = 0;

  return {
    next: function(level, annex) {
      if(inAnnex && !annex) throw new Error("Clauses cannot follow annexes");
      if(level - currentLevel > 1) throw new Error("Skipped clause");

      var nextNum = annex ? nextAnnexNum : nextClauseNum;

      if(level === currentLevel) {
        ids[currentLevel] = nextNum(level);
      } else if(level > currentLevel) {
        ids.push(nextNum(level));
      } else {
        ids.length = level + 1;
        ids[level] = nextNum(level);
      }

      currentLevel = level;

      return {value: ids.join('.'), done: false}
    }
  }

  function nextAnnexNum(level) {
    if(!inAnnex) {
      if(level > 0) throw new Error("First annex must be at depth 0");
      inAnnex = true;

      return 'A'
    }

    if(level === 0) {
      return String.fromCharCode(ids[0].charCodeAt(0) + 1);
    }

    return nextClauseNum(level);
  }

  function nextClauseNum(level) {
    if(ids[level] === undefined) return 1;
    return ids[level] + 1;
  }
}
