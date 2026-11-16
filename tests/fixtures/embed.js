// The test page for scenario 4: draws the comprehensive sample into a place
// 1,000 points wide and asks to be told about buttons.
(function () {
  'use strict';
  window.ACTIONS = [];
  const text = name => window.BOARD_SAMPLES.find(s => s.file === name).text;
  window.drawSample = name => BoardGenerator.draw(document.getElementById('place'), text(name), {
    onAction: (action, id) => window.ACTIONS.push([action, id]),
  });
  window.LOADED_AT = performance.now();
  window.RESULT = window.drawSample('2-comprehensive.json');
})();
