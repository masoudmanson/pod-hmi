var graph,
  allCells,
  MAP_CELLS = {},
  MAP_LEDS = {},
  MAP_PROGRESS_BAR = {},
  MAP_SPEEDOMETER = {};

mxVertexHandler.prototype.livePreview = true;
mxVertexHandler.prototype.rotationEnabled = true;

/**
 * @param   {string}    socketAddress       Socket address of server
 * @param   {string}    serverName          Name of server to register on
 * @param   {string}    deviceId            Device ID
 * @param   {string}    appId               ID of current app
 * @param   {int}       peerId              ID of Peer who is in receivers list of server
 */
var params = {
  socketAddress: "ws://172.16.110.20:8003/ws",
  deviceId: "hmi-server",
  serverName: "oauth-wire",
  appId: "hmi-app",
  peerId: 2,
  reconnectOnClose: true,
  connectionCheckTimeout: 10000,
  serverRegisteration: false,
  asyncLogging: {
    onFunction: true,
    // onMessageReceive: true,
    // onMessageSend: true
  }
};

function initAsync() {

  /**
   * Create a new Async Instance with given parameters
   */
  var asyncClient = new POD.Async(params);

  /**
   * Whenever your Async connection gets asyncReady
   * you would be abale to send messages through
   */
  asyncClient.on("asyncReady", function() {
    allCells = Object.values(graph.getModel().cells);

    try {
      for (var i = 0; i < allCells.length; i++) {
        if (mxUtils.isNode(allCells[i].value)) {
          switch (allCells[i].getAttribute('type')) {
            case 'led':
              if (allCells[i].getAttribute('entityId') > 0) {
                var ledValues = [],
                ledColors = [],
                ledBreakPoints = allCells[i].getAttribute('breakPoints').split(',').map(function(str) {
                  ledValues.push(parseInt(str.split(':')[0].trim()));
                  ledColors.push(str.split(':')[1].trim());
                });

                MAP_LEDS[allCells[i].getAttribute('entityId')] = {
                  cell: allCells[i],
                  id: allCells[i].id,
                  label: allCells[i].getAttribute('label'),
                  values: ledValues,
                  colors: ledColors
                };
              }
              break;

            case 'progress_bar':
              if (allCells[i].getAttribute('entityId') > 0) {
                var cellGeometry = allCells[i].getGeometry(),
                  cellLength = (cellGeometry.height > cellGeometry.width) ? cellGeometry.height : cellGeometry.width,
                  valueRatio = (allCells[i].getAttribute('maxValue') > 0) ? allCells[i].getAttribute('maxValue') / cellLength : 1,
                  progressBarStops = [],
                  progressBarColors = [],
                  progressBarBreakPoints = allCells[i].getAttribute('breakPoints').split(',').map(function(str) {
                    progressBarStops.push(str.split(':')[0].trim());
                    progressBarColors.push(str.split(':')[1].trim());
                  });

                MAP_PROGRESS_BAR[allCells[i].getAttribute('entityId')] = {
                  cell: allCells[i],
                  id: allCells[i].id,
                  label: allCells[i].getAttribute('label'),
                  valueRatio: valueRatio,
                  progressBarStops: progressBarStops,
                  progressBarColors: progressBarColors,
                  cellOrientation: (cellGeometry.height > cellGeometry.width) ? 'vertical' : 'horizontal'
                };
              }
              break;

            case 'speedometer':
              if (allCells[i].getAttribute('entityId') > 0) {
                MAP_SPEEDOMETER[allCells[i].getAttribute('entityId')] = {
                  cell: allCells[i],
                  id: allCells[i].id,
                  label: allCells[i].getAttribute('label'),
                  minValue: allCells[i].getAttribute('minValue'),
                  maxValue: allCells[i].getAttribute('maxValue'),
                  step: allCells[i].getAttribute('step'),
                  angel: allCells[i].getAttribute('angel'),
                  previousValue: 0
                };
              }
              break;

            default:
              if (allCells[i].getAttribute('entityId') > 0) {
                MAP_CELLS[allCells[i].getAttribute('entityId')] = {
                  cell: allCells[i],
                  id: allCells[i].id,
                  label: allCells[i].getAttribute('label'),
                  unit: allCells[i].getAttribute('unit')
                };
              }
              break;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    console.log({
      MAP_CELLS,
      MAP_LEDS,
      MAP_PROGRESS_BAR,
      MAP_SPEEDOMETER
    });

    fakeDataGenerator();
  });

  /**
   * Listening to messages come from async gate
   * @param   {string}    msg     Received Message From Async
   * @param   {function}  ack     Callback function responsible of returning acknowledgements
   */
  asyncClient.on("message", function(msg, ack) {
    /**
     * HMI map should be updated whenever some new
     * messages come from async gate so that the
     * map would be updated all the time
     */
    var content = JSON.parse(msg.content);

    updateMap(content);
  });

  /**
   * To show Async Status, we need to get state changes of
   * async connection and display the state on the page
   */
  asyncClient.on("stateChange", function(state) {
    switch (state.socketState) {
      case 0:
        document.getElementById("async-status").innerText = "Connecting";
        document.getElementById("async-status").style.color = "#bbb";
        break;

      case 1:
        document.getElementById("async-status").innerText = "Connected";
        document.getElementById("async-status").style.color = "#78d310";
        break;

      case 2:
        document.getElementById("async-status").innerText = "Closing";
        document.getElementById("async-status").style.color = "#26d7ff";
        break;

      case 3:
        document.getElementById("async-status").innerText = "Not Connected";
        document.getElementById("async-status").style.color = "red";
        break;

      default:

    }
  });
}

function main(container) {
  if (!mxClient.isBrowserSupported()) {
    mxUtils.error('Browser is not supported!', 200, false);
  } else {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'diagram.xml', true);
    xhr.timeout = 10000;

    xhr.onload = function() {
      var xml = new XMLSerializer().serializeToString(this.responseXML);
      var containerDOM = document.getElementById(container);

      graph = createGraph(containerDOM);

      // // TODO:  Test shit
      // new mxRubberband(graph);
      // graph.getView().updateStyle = true;

      var xmlDoc = mxUtils.parseXml(xml);
      var codec = new mxCodec(xmlDoc);
      codec.decode(xmlDoc.documentElement, graph.getModel());
      var margin = 200;
      var max = 3;

      var bounds = graph.getGraphBounds();
      var cw = graph.container.clientWidth - margin;
      var ch = graph.container.clientHeight - margin;
      var w = bounds.width / graph.view.scale;
      var h = bounds.height / graph.view.scale;
      var s = Math.min(max, Math.min(cw / w, ch / h));

      graph.view.scaleAndTranslate(s,
        (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
        (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);
    };

    xhr.ontimeout = function(e) {
      console.error("Getting Diagram XML faced an issue!", e);
    };

    xhr.send(null);

    document.body.appendChild(mxUtils.button('+', function() {
      graph.zoomIn();
    }));

    document.body.appendChild(mxUtils.button('-', function() {
      graph.zoomOut();
    }));

    initAsync();
  }
}

function createGraph(container) {
  var graph = new Graph(container);
  graph.resizeContainer = true;
  graph.setTooltips(true);
  graph.setEnabled(false);
  return graph;
}

function updateMap(content) {
  if (content.entityId == 7) {
    // console.log(content.value, value);
  }

  var entityId = content.entityId,
    value = content.value,
    model = graph.getModel();

  if (MAP_LEDS.hasOwnProperty(entityId)) {
    try {
      var led = MAP_LEDS[entityId],
        cell = led.cell,
        ledColors = led.colors,
        ledValues = led.values,
        led_value = parseInt(value);

      led_value = (led_value % 2 == 0) ? (led_value % 5 == 0) ? 2 : 1 : 0;
      var color = ledColors[led_value];
    } catch (e) {
      console.error(e);
    } finally {
      model.beginUpdate();
      model.setValue(cell, parseInt(content.value));
      graph.setCellStyles(mxConstants.STYLE_FILLCOLOR, color, [cell]);
      graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [cell]);
      model.endUpdate();
      graph.refresh();
    }
  }

  if (MAP_PROGRESS_BAR.hasOwnProperty(entityId)) {
    try {
      var progressBar = MAP_PROGRESS_BAR[entityId],
        cell = progressBar.cell,
        cellOrientation = progressBar.cellOrientation;
    } catch (e) {
      console.error(e);
    } finally {
      model.beginUpdate();

      var cellGeometry = cell.getGeometry();

      if (cellOrientation == "vertical")
        cellGeometry.height = parseInt(value / progressBar.valueRatio);
      else
        cellGeometry.width = parseInt(value / progressBar.valueRatio);

      var color = progressBar.progressBarColors[0];

      for (var i = 0; i < progressBar.progressBarStops.length; i++) {
        if (value > progressBar.progressBarStops[i]) {
          color = progressBar.progressBarColors[i];
        } else {
          color = progressBar.progressBarColors[i - 1];
          break;
        }
      }

      graph.setCellStyles(mxConstants.STYLE_FILLCOLOR, color, [cell]);
      graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [cell]);

      model.endUpdate();
      graph.refresh();
    }
  }

  if (MAP_SPEEDOMETER.hasOwnProperty(entityId)) {
    try {
      var speedometer = MAP_SPEEDOMETER[entityId],
        cell = speedometer.cell;
    } catch (e) {
      console.error(e);
    } finally {
      model.beginUpdate();

      var cellGeometry = cell.getGeometry();


      var angel = ((value - speedometer.previousValue) * speedometer.angel) / speedometer.maxValue - speedometer.minValue;
      cellGeometry.rotate(angel, cellGeometry.sourcePoint);

      MAP_SPEEDOMETER[entityId].previousValue = value;

      model.endUpdate();
      graph.refresh();
    }
  }

  if (MAP_CELLS.hasOwnProperty(entityId)) {
    try {
      var customNode = MAP_CELLS[entityId],
        cell = customNode.cell,
        unit = customNode.unit || "";

      model.beginUpdate();
      model.setValue(cell, parseInt(value) + " " + unit);
    } catch (e) {
      console.error(e);
    } finally {
      model.endUpdate();
      graph.refresh();
    }
  }
}

function replaceLabels() {
  var model = graph.getModel();

  model.beginUpdate();
  try {
    var allCells = Object.values(model.cells);

    for (var i = 0; i < allCells.length; i++) {
      var cell = allCells[i];
      graph.model.setValue(cell, cell.getAttribute('label'));
    }
  } catch (e) {
    console.error(e);
  } finally {
    model.endUpdate();
  }
}

function fakeDataGenerator() {
  setInterval(function() {
    var data = {
      entityId: Math.ceil(Math.random(10) * 10),
      value: Math.ceil(Math.random(100) * 50)
    }

    updateMap(data);
  }, 200);
}
