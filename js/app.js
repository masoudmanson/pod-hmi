var graph,
    asyncClient,
    allCells,
    MAP_CELLS = {},
    MAP_LEDS = {},
    MAP_PROGRESS_BAR = {},
    MAP_SPEEDOMETER = {},
    MAP_EFFECTS = {};

var cw, ch,
    margin = 50,
    max = 2;

var containerDOM, outlineDOM, statusDOM;

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
    reconnectOnClose: false,
    connectionCheckTimeout: 10000,
    serverRegisteration: false,
    asyncLogging: {
        onFunction: true,
        // onMessageReceive: true,
        // onMessageSend: true
    }
};

function main(graphContainer, outlineContainer, statusContainer) {
    if (!mxClient.isBrowserSupported()) {
        mxUtils.error('Browser is not supported!', 200, false);
    } else {
        containerDOM = document.getElementById(graphContainer),
            outlineDOM = document.getElementById(outlineContainer),
            statusDOM = document.getElementById(statusContainer);

        /*
        * Set Width & Height for Outline Container as 20% of main container
        * */
        outlineDOM.style.width = containerDOM.getBoundingClientRect().width / 5;
        outlineDOM.style.height = containerDOM.getBoundingClientRect().height / 5;

        graph = createGraph(containerDOM, statusDOM, outlineDOM);

        graph.getModel().beginUpdate();

        try {
            read(graph, 'diagram2.xml');

            cw = graph.container.clientWidth - margin;
            ch = graph.container.clientHeight - margin;
        }
        finally {
            graph.getModel().endUpdate();

            graph.zoomActual();

            var bounds = graph.getGraphBounds();

            var w = bounds.width / graph.view.scale,
                h = bounds.height / graph.view.scale,
                s = Math.min(max, Math.min(cw / w, ch / h));

            graph.view.scaleAndTranslate(s,
                (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
                (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);

            applyCellEffects();
        }

        initAsync();
    }
}

function initAsync() {

    /**
     * Create a new Async Instance with given parameters
     */
    asyncClient = new PodAsync(params);

    /**
     * Whenever your Async connection gets asyncReady
     * you would be abale to send messages through
     */
    asyncClient.on("asyncReady", function () {
        updateMap();
    });

    /**
     * Listening to messages come from async gate
     * @param   {string}    msg     Received Message From Async
     * @param   {function}  ack     Callback function responsible of returning acknowledgements
     */
    asyncClient.on("message", function (msg, ack) {
        /**
         * HMI map should be updated whenever some new
         * messages come from async gate so that the
         * map would be updated all the time
         */
        var content = JSON.parse(msg.content);

        renderLiveDataOnMap(content);
    });

    /**
     * To show Async Status, we need to get state changes of
     * async connection and display the state on the page
     */
    asyncClient.on("stateChange", function (state) {
        switch (state.socketState) {
            case 0:
                document.getElementById("toolbar-async").innerText = "Async: Connecting";
                document.getElementById("toolbar-async").style.color = "blue";
                break;

            case 1:
                document.getElementById("toolbar-async").innerText = "Async: Connected";
                document.getElementById("toolbar-async").style.color = "green";
                break;

            case 2:
                document.getElementById("toolbar-async").innerText = "Async: Closing";
                document.getElementById("toolbar-async").style.color = "orange";
                break;

            case 3:
                document.getElementById("toolbar-async").innerText = "Async: Not Connected";
                document.getElementById("toolbar-async").style.color = "red";
                break;
        }
    });

    // TEMP for testing
    updateMap();
}

function read(graph, filename) {
    var req = mxUtils.load(filename);
    var root = req.getDocumentElement();
    var dec = new mxCodec(root.ownerDocument);

    dec.decode(root, graph.getModel());
};

function createGraph(graphContainer, toolbarContainer, outlineContainer) {
    var graph = new Graph(graphContainer);

    var outlineObject = new mxOutline(graph, outlineContainer);

    graph.setTooltips(true);
    graph.setEnabled(false);
    graph.setPanning(true);
    graph.panningHandler.useLeftButtonForPanning = true;
    graph.panningHandler.ignoreCell = true;
    mxOutline.prototype.border = 0;

    addToolbarButton(graph, toolbarContainer, 'async', 'Async: Connecting', '', false);
    addToolbarButton(graph, toolbarContainer, 'zoomIn', 'Zoom In', '', false);
    addToolbarButton(graph, toolbarContainer, 'zoomOut', 'Zoom Out', '', false);
    addToolbarButton(graph, toolbarContainer, 'actualSize', 'Actual Size', '', false);
    addToolbarButton(graph, toolbarContainer, 'fit', 'Fit', '', false);

    graph.dblClick = function (evt, cell) {
        graph.zoomIn();
    };

    return graph;
}

function renderLiveDataOnMap(content) {
    var entityId = content.entityId,
        value = content.value,
        model = graph.getModel();

    if (MAP_LEDS.hasOwnProperty(entityId)) {
        for (var i = 0; i < MAP_LEDS[entityId].length; i++) {
            try {
                var led = MAP_LEDS[entityId][i],
                    cell = led.cell,
                    ledColors = led.colors,
                    ledValues = led.values;

                ledValueIndex = ledValues.indexOf(value);//(led_value % 2 == 0) ? (led_value % 5 == 0) ? 2 : 1 : 0;
                var color = ledColors[ledValueIndex];
            } catch (e) {
                console.error(e);
            } finally {
                model.beginUpdate();
                // model.setValue(cell, parseInt(content.value));
                graph.setCellStyles(mxConstants.STYLE_FILLCOLOR, color, [cell]);
                // graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [cell]);
                model.endUpdate();
                graph.refresh();
            }
        }
    }

    if (MAP_PROGRESS_BAR.hasOwnProperty(entityId)) {
        for (var i = 0; i < MAP_PROGRESS_BAR[entityId].length; i++) {
            try {
                var progressBar = MAP_PROGRESS_BAR[entityId][i],
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
                // graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [cell]);

                model.endUpdate();
                graph.refresh();
            }
        }
    }

    if (MAP_SPEEDOMETER.hasOwnProperty(entityId)) {
        for (var i = 0; i < MAP_SPEEDOMETER[entityId].length; i++) {
            try {
                var speedometer = MAP_SPEEDOMETER[entityId][i],
                    cell = speedometer.cell;
            } catch (e) {
                console.error(e);
            } finally {
                model.beginUpdate();

                var cellGeometry = cell.getGeometry();

                var angel = ((value - speedometer.previousValue) * speedometer.angel) / speedometer.maxValue - speedometer.minValue;
                cellGeometry.rotate(angel, cellGeometry.sourcePoint);

                MAP_SPEEDOMETER[entityId][i].previousValue = value;

                model.endUpdate();
                graph.refresh();
            }
        }
    }

    if (MAP_CELLS.hasOwnProperty(entityId)) {
        for (var i = 0; i < MAP_CELLS[entityId].length; i++) {
            try {
                var customNode = MAP_CELLS[entityId][i],
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
}

function fakeDataGenerator() {
    setInterval(function () {
        var data = {
            entityId: Math.ceil(Math.random(10) * 10),
            value: Math.floor(Math.random(2) * 2)
        }

        // var data = {
        //     entityId: 4,
        //     value: Math.floor(Math.random(2) * 2)
        // }

        renderLiveDataOnMap(data);
    }, 100);
}

function addToolbarButton(graphObj, toolbar, action, label, image, isTransparent) {
    var button = document.createElement('button');
    button.setAttribute("id", "toolbar-" + action);
    button.style.fontSize = '12';

    if (image != '') {
        var img = document.createElement('img');
        img.setAttribute('src', image);
        img.style.width = '16px';
        img.style.height = '16px';
        img.style.verticalAlign = 'middle';
        img.style.marginRight = '2px';
        button.appendChild(img);
    }
    if (isTransparent) {
        button.style.background = 'transparent';
        button.style.color = '#FFFFFF';
        button.style.border = 'none';
    }

    mxEvent.addListener(button, 'click', function (evt) {
        switch (action) {
            case "async":
                switch (asyncClient.getAsyncState()) {
                    case 0:
                    case 3:
                        console.log('Not Connected');
                        if (confirm("Do you want to reconnect into async server?")) {
                            asyncClient.reconnectSocket();
                            document.getElementById("toolbar-async").innerText = "Async: Connecting";
                            document.getElementById("toolbar-async").style.color = "blue";
                        }
                        break;

                    case 1:
                        console.log('Connected');
                        if (confirm("Are you sure you want to disconnect async?")) {
                            asyncClient.close();
                        }
                        break;

                    case 2:
                        console.log('Closing');
                        alert("Async is closing.");
                        break;
                }
                break;

            case "zoomIn":
                graph.zoomIn();
                break;

            case "zoomOut":
                graph.zoomOut();
                break;

            case "actualSize":
                graph.zoomActual();
                break;

            case "fit":
                graph.zoomActual();

                var bounds = graph.getGraphBounds();

                var w = bounds.width / graph.view.scale,
                    h = bounds.height / graph.view.scale,
                    s = Math.min(max, Math.min(cw / w, ch / h));

                graph.view.scaleAndTranslate(s,
                    (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
                    (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);

                break;
        }
    });
    mxUtils.write(button, label);
    toolbar.appendChild(button);
};

function updateMap() {
    allCells = Object.values(graph.getModel().cells);

    try {
        for (var i = 0; i < allCells.length; i++) {
            if (mxUtils.isNode(allCells[i].value)) {
                switch (allCells[i].getAttribute('type')) {
                    case 'led':

                        if (allCells[i].getAttribute('entityId') > 0) {
                            var ledValues = [],
                                ledColors = [],
                                ledBreakPoints = allCells[i].getAttribute('breakPoints').split(',').map(function (str) {
                                    ledValues.push(parseInt(str.split(':')[0].trim()));
                                    ledColors.push(str.split(':')[1].trim());
                                });

                            if (!Array.isArray(MAP_LEDS[allCells[i].getAttribute('entityId')])) {
                                MAP_LEDS[allCells[i].getAttribute('entityId')] = [];
                            }

                            if (allCells[i].children) {
                                var children = allCells[i].children[0].children;

                                for (var j = 0; j < children.length; j++) {
                                    if (mxUtils.isNode(children[j].value)) {
                                        if (children[j].getAttribute('active') == 'yes' || children[j].getAttribute('active').toLowerCase() == 'true' || parseInt(children[j].getAttribute('active')) == 1) {
                                            MAP_LEDS[allCells[i].getAttribute('entityId')].push({
                                                cell: children[j],
                                                id: children[j].id,
                                                label: children[j].getAttribute('label'),
                                                values: ledValues,
                                                colors: ledColors
                                            });
                                        }
                                    }
                                }
                            } else {
                                MAP_LEDS[allCells[i].getAttribute('entityId')].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    values: ledValues,
                                    colors: ledColors
                                });
                            }
                        }
                        break;

                    case 'progress_bar':
                        if (allCells[i].getAttribute('entityId') > 0) {
                            var cellGeometry = allCells[i].getGeometry(),
                                cellLength = (cellGeometry.height > cellGeometry.width) ? cellGeometry.height : cellGeometry.width,
                                valueRatio = (allCells[i].getAttribute('maxValue') > 0) ? allCells[i].getAttribute('maxValue') / cellLength : 1,
                                progressBarStops = [],
                                progressBarColors = [],
                                progressBarBreakPoints = allCells[i].getAttribute('breakPoints').split(',').map(function (str) {
                                    progressBarStops.push(str.split(':')[0].trim());
                                    progressBarColors.push(str.split(':')[1].trim());
                                });

                            if (!Array.isArray(MAP_PROGRESS_BAR[allCells[i].getAttribute('entityId')])) {
                                MAP_PROGRESS_BAR[allCells[i].getAttribute('entityId')] = [];
                            }

                            MAP_PROGRESS_BAR[allCells[i].getAttribute('entityId')].push({
                                cell: allCells[i],
                                id: allCells[i].id,
                                label: allCells[i].getAttribute('label'),
                                valueRatio: valueRatio,
                                progressBarStops: progressBarStops,
                                progressBarColors: progressBarColors,
                                cellOrientation: (cellGeometry.height > cellGeometry.width) ? 'vertical' : 'horizontal'
                            });
                        }
                        break;

                    case 'speedometer':
                        if (allCells[i].getAttribute('entityId') > 0) {

                            if (!Array.isArray(MAP_SPEEDOMETER[allCells[i].getAttribute('entityId')])) {
                                MAP_SPEEDOMETER[allCells[i].getAttribute('entityId')] = [];
                            }

                            MAP_SPEEDOMETER[allCells[i].getAttribute('entityId')].push({
                                cell: allCells[i],
                                id: allCells[i].id,
                                label: allCells[i].getAttribute('label'),
                                minValue: allCells[i].getAttribute('minValue'),
                                maxValue: allCells[i].getAttribute('maxValue'),
                                step: allCells[i].getAttribute('step'),
                                angel: allCells[i].getAttribute('angel'),
                                previousValue: 0
                            });
                        }
                        break;

                    default:
                        if (allCells[i].getAttribute('entityId') > 0) {

                            if (!Array.isArray(MAP_CELLS[allCells[i].getAttribute('entityId')])) {
                                MAP_CELLS[allCells[i].getAttribute('entityId')] = [];
                            }

                            MAP_CELLS[allCells[i].getAttribute('entityId')].push({
                                cell: allCells[i],
                                id: allCells[i].id,
                                label: allCells[i].getAttribute('label'),
                                unit: allCells[i].getAttribute('unit')
                            });
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
        MAP_SPEEDOMETER,
        MAP_EFFECTS
    });

    fakeDataGenerator();
}

function applyCellEffects() {
    allCells = Object.values(graph.getModel().cells);

    try {
        for (var i = 0; i < allCells.length; i++) {
            if (mxUtils.isNode(allCells[i].value)) {
                if (allCells[i].getAttribute('effect')) {
                    allCells[i].getAttribute('effect').split(',').map(function (str) {
                        var cellEffectName = str.split(':')[0].trim(),
                            cellEffectValue = str.split(':')[1].trim();

                        switch (cellEffectName) {
                            case "flow":
                                var state = graph.view.getState(allCells[i]);
                                state.shape.node.getElementsByTagName('path')[1].setAttribute('class', 'flow-' + cellEffectValue);
                                break;
                        }
                    });
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

window.addEventListener("resize", function () {
    if (graph) {
        cw = graph.container.clientWidth - margin;
        ch = graph.container.clientHeight - margin;

        outlineDOM.style.width = containerDOM.getBoundingClientRect().width / 5;
        outlineDOM.style.height = containerDOM.getBoundingClientRect().height / 5;
    }
});
