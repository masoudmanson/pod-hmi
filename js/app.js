var graph,
    asyncClient,
    allCells,
    MAP_CELLS = {},
    MAP_LEDS = {},
    MAP_PROGRESS_BAR = {},
    MAP_SPEEDOMETER = {},
    mapData,
    mapTheme = 'light',
    graphContainer,
    outlineContainer,
    statusContainer,
    renderingPitch,
    pitchInterval,
    asyncData = {},
    asyncStatus = false,
    numbersRoundPrecision;

var DYNAMIC_CELLS = [];

var cw, ch,
    margin = 50,
    max = 2;

var containerDOM, outlineDOM, statusDOM;

var params = {
    socketAddress: 'ws://172.16.110.20:8003/ws',
    deviceId: 'hmi-server',
    serverName: 'oauth-wire',
    appId: 'hmi-app',
    peerId: 2,
    reconnectOnClose: false,
    connectionCheckTimeout: 10000,
    serverRegisteration: false,
    asyncLogging: {
        onFunction: true
        // onMessageReceive: true,
        // onMessageSend: true
    }
};

/**
 * Async Functions
 */

function initAsync() {

    /**
     * Create a new Async Instance with given parameters
     */
    asyncClient = new PodAsync(params);

    /**
     * Whenever your Async connection gets asyncReady
     * you would be abale to send messages through
     */
    asyncClient.on('asyncReady', function() {
        updateMap();
    });

    /**
     * Listening to messages come from async gate
     * @param   {string}    msg     Received Message From Async
     * @param   {function}  ack     Callback function responsible of returning acknowledgements
     */
    asyncClient.on('message', function(msg, ack) {
        /**
         * HMI map should be updated whenever some new
         * messages come from async gate so that the
         * map would be updated all the time
         */
        var content = JSON.parse(msg.content);
        asyncData[content.entityId] = content.value;
        console.log(content);
    });

    /**
     * To show Async Status, we need to get state changes of
     * async connection and display the state on the page
     */
    asyncClient.on('stateChange', function(state) {
        switch (state.socketState) {
            case 0:
                asyncStatus = false;
                document.getElementById('toolbar-async').innerText = 'Async: Connecting';
                document.getElementById('toolbar-async').style.background = 'orange';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 1:
                asyncStatus = true;

                /**
                 * Rerender Map only if async is connected
                 * Before setting new interval, we should
                 * clear previuos one to avoid conflicts
                 */
                pitchInterval && clearInterval(pitchInterval);

                pitchInterval = setInterval(function() {
                    renderLiveDataOnMapWithPitch(asyncData);
                }, renderingPitch * 1000);

                document.getElementById('toolbar-async').innerText = 'Async: Connected';
                document.getElementById('toolbar-async').style.background = 'green';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 2:
                asyncStatus = false;
                pitchInterval && clearInterval(pitchInterval);
                document.getElementById('toolbar-async').innerText = 'Async: Closing';
                document.getElementById('toolbar-async').style.background = 'orange';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 3:
                asyncStatus = false;
                pitchInterval && clearInterval(pitchInterval);
                document.getElementById('toolbar-async').innerText = 'Async: Not Connected';
                document.getElementById('toolbar-async').style.background = 'red';
                document.getElementById('toolbar-async').style.color = 'white';
                break;
        }
    });
}

function getMapsList() {
    // Get Maps List
    // var data = {
    //     type: 5,
    //     content: ''
    // };

    // Save Map
    var data = {
        type: 3,
        content: {
            name: new Date().getTime(),
            content: new Date()
        }
    };

    var asyncMessage = {
        type: 5,
        content: {
            // peerName: 'fanitoring-service',
            receivers: [2, 165592],
            content: JSON.stringify(data)
        }
    };

    asyncClient.send(asyncMessage);
}

/**
 * Map Functions
 */

function main(params) {
    if (!mxClient.isBrowserSupported()) {
        mxUtils.error('Browser is not supported!', 200, false);
    }

    else {
        if (params) {
            if (typeof params.map == 'object') {
                mapData = params.map;

                if (typeof params.map.theme == 'string') {
                    mapTheme = params.map.theme;
                }
                else {
                    mapTheme = undefined;
                }
            }

            if (typeof params.graphContainer == 'string') {
                graphContainer = params.graphContainer;
            }

            if (typeof params.outlineContainer == 'string') {
                outlineContainer = params.outlineContainer;
            }

            if (typeof params.statusContainer == 'string') {
                statusContainer = params.statusContainer;
            }

            if (typeof params.renderingPitch == 'string') {
                switch (params.renderingPitch) {
                    case 'high':
                        renderingPitch = 2;
                        break;
                    case 'medium':
                        renderingPitch = 5;
                        break;
                    case 'low':
                        renderingPitch = 10;
                        break;
                    default:
                        renderingPitch = 5;
                        break;
                }
            }

            numbersRoundPrecision = (typeof params.numbersRoundPrecision == 'number') ? params.numbersRoundPrecision : 2;
        }

        containerDOM = document.getElementById(graphContainer),
            outlineDOM = document.getElementById(outlineContainer),
            statusDOM = document.getElementById(statusContainer);

        /*
         * Set Width & Height for Outline Container as 20% of main container
         * */
        if (outlineDOM != null) {
            outlineDOM.style.width = containerDOM.getBoundingClientRect().width / 5;
            outlineDOM.style.height = containerDOM.getBoundingClientRect().height / 5;
        }

        graph = createGraph(containerDOM, statusDOM, outlineDOM);

        graph.getModel()
            .beginUpdate();

        try {
            var mapXmlData;

            if (typeof mapData.data == 'object') {
                if (typeof mapData.theme == 'string' && typeof mapData.data[mapData.theme] == 'string') {
                    mapXmlData = mapData.data[mapData.theme];
                }
                else {
                    mapXmlData = mapData.data['light'];
                }
            }
            else if (typeof mapData.data == 'string') {
                mapXmlData = mapData.data;
            }

            switch (mapData.type) {
                case 'file':
                    read(graph, mapXmlData);
                    break;

                case 'text':
                    break;

                default:
                    console.error('No XML map has found! (Check parameters you have sent to main function)');
                    break;
            }

            cw = graph.container.clientWidth - margin;
            ch = graph.container.clientHeight - margin;
        }
        catch (e) {
            console.error('Problem in reading map XML file!', e);
        }
        finally {
            graph.getModel()
                .endUpdate();

            graph.zoomActual();

            var bounds = graph.getGraphBounds();

            var w = bounds.width / graph.view.scale,
                h = bounds.height / graph.view.scale,
                s = Math.min(max, Math.min(cw / w, ch / h)) * 0.9;

            graph.view.scaleAndTranslate(s,
                (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
                (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);

            /**
             * Set Background color to body and outlineContainer according
             * to mxGraphModel's background attribute
             */
            document.body.style.background = graph.model.background;
            if (outlineDOM != null) {
                outlineDOM.style.background = graph.model.background;
            }
        }

        initAsync();
        fakeDataGenerator();
    }
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

    if (toolbarContainer != null) {
        addToolbarButton(graph, toolbarContainer, 'async', 'Async: Connecting', '', false);
        addToolbarButton(graph, toolbarContainer, 'getMaps', 'Get Maps List', '', false);
        addToolbarButton(graph, toolbarContainer, 'zoomIn', '', '/style/img/zoom-in.svg', false);
        addToolbarButton(graph, toolbarContainer, 'zoomOut', '', '/style/img/zoom-out.svg', false);
        addToolbarButton(graph, toolbarContainer, 'actualSize', '', '/style/img/full-size.svg', false);
        addToolbarButton(graph, toolbarContainer, 'fit', '', '/style/img/screen.svg', false);
        if (typeof mapData.data == 'object') {
            addToolbarButton(graph, toolbarContainer, 'theme', '', '/style/img/theme.svg', false);
        }
    }
    graph.dblClick = function(evt, cell) {
        graph.zoomIn();
    };

    return graph;
}

function renderLiveDataOnMapWithPitch(content) {
    var model = graph.getModel();

    model.beginUpdate();

    for (var key in content) {
        var entityId = key,
            value = content[key];

        if (DYNAMIC_CELLS[entityId]) {
            for (var i = 0; i < DYNAMIC_CELLS[entityId].length; i++) {
                switch (DYNAMIC_CELLS[entityId][i].type) {
                    case 'led':
                        try {
                            var led = DYNAMIC_CELLS[entityId][i],
                                cell = led.cell,
                                ledColors = led.colors,
                                ledValues = led.values;

                            ledValueIndex = ledValues.indexOf(value);
                            var color = ledColors[ledValueIndex];
                        }
                        catch (e) {
                            console.error(e);
                        }
                        finally {
                            graph.setCellStyles(mxConstants.STYLE_FILLCOLOR, color, [cell]);
                        }
                        break;

                    case 'progress_bar':
                        try {
                            var progressBar = DYNAMIC_CELLS[entityId][i],
                                cell = progressBar.cell,
                                cellOrientation = progressBar.cellOrientation;
                        }
                        catch (e) {
                            console.error(e);
                        }
                        finally {
                            var cellGeometry = cell.getGeometry();

                            if (cellOrientation == 'vertical') {
                                cellGeometry.height = parseInt(value / progressBar.valueRatio);
                                cellGeometry.y = progressBar.endPoint.y - parseInt(value / progressBar.valueRatio);
                            }
                            else {
                                cellGeometry.width = parseInt(value / progressBar.valueRatio);
                            }

                            var color = progressBar.progressBarColors[0];

                            for (var k = 0; k < progressBar.progressBarStops.length; k++) {
                                if (value > progressBar.progressBarStops[k]) {
                                    color = progressBar.progressBarColors[k];
                                }
                                else {
                                    color = progressBar.progressBarColors[k - 1];
                                    break;
                                }
                            }

                            graph.setCellStyles(mxConstants.STYLE_FILLCOLOR, color, [cell]);
                        }
                        break;

                    case 'speedometer':
                        try {
                            var speedometer = DYNAMIC_CELLS[entityId][i],
                                cell = speedometer.cell;
                        }
                        catch (e) {
                            console.error(e);
                        }
                        finally {
                            var cellGeometry = cell.getGeometry();

                            var angel = ((value - speedometer.previousValue) *
                                speedometer.angel) / speedometer.maxValue -
                                speedometer.minValue;

                            cellGeometry.rotate(angel, cellGeometry.sourcePoint);

                            DYNAMIC_CELLS[entityId][i].previousValue = value;
                        }
                        break;

                    default:
                        try {
                            var customNode = DYNAMIC_CELLS[entityId][i],
                                cell = customNode.cell,
                                unit = customNode.unit || '';

                            model.setValue(cell, Math.round(value * Math.pow(10, numbersRoundPrecision)) / Math.pow(10, numbersRoundPrecision) + ' ' + unit);
                        }
                        catch (e) {
                            console.error(e);
                        }
                        break;
                }
            }
        }
    }

    model.endUpdate();
    graph.refresh();
}

function changeTheme() {
    var mapXmlData;

    if (mapTheme == 'light' && mapData.data.hasOwnProperty('dark')) {
        mapTheme = 'dark';
        mapXmlData = mapData.data['dark'];
    }
    else if (mapTheme == 'dark' && mapData.data.hasOwnProperty('light')) {
        mapTheme = 'light';
        mapXmlData = mapData.data['light'];
    }

    graph.getModel()
        .beginUpdate();

    try {
        switch (mapData.type) {
            case 'file':
                read(graph, mapXmlData);
                break;

            case 'text':
                break;

            default:
                console.error('No XML map has found! (Check parameters you have sent to main function)');
                break;
        }

        cw = graph.container.clientWidth - margin;
        ch = graph.container.clientHeight - margin;
    }
    catch (e) {
        console.error('Problem in reading map XML file!', e);
    }
    finally {
        graph.getModel()
            .endUpdate();

        graph.zoomActual();

        var bounds = graph.getGraphBounds();

        var w = bounds.width / graph.view.scale,
            h = bounds.height / graph.view.scale,
            s = Math.min(max, Math.min(cw / w, ch / h)) * 0.9;

        graph.view.scaleAndTranslate(s,
            (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
            (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);

        /**
         * Set Background color to body and outlineContainer according
         * to mxGraphModel's background attribute
         */
        document.body.style.background = graph.model.background;
        if (outlineDOM != null) {
            outlineDOM.style.background = graph.model.background;
        }
    }

    updateMap();
}

function addToolbarButton(graphObj, toolbar, action, label, image, isTransparent) {
    var button = document.createElement('button');
    button.setAttribute('id', 'toolbar-' + action);
    button.style.fontSize = '12';

    if (image != '') {
        var img = document.createElement('img');
        img.setAttribute('src', image);
        img.style.width = '14px';
        img.style.height = '14px';
        img.style.verticalAlign = 'middle';
        img.style.marginRight = '2px';
        button.appendChild(img);
        button.style.fontSize = '14';
    }
    if (isTransparent) {
        button.style.background = 'transparent';
        button.style.color = '#FFFFFF';
        button.style.border = 'none';
    }

    mxEvent.addListener(button, 'click', function(evt) {
        switch (action) {
            case 'async':
                switch (asyncClient.getAsyncState()) {
                    case 0:
                    case 3:
                        if (confirm('Do you want to reconnect into async server?')) {
                            asyncClient.reconnectSocket();
                            document.getElementById('toolbar-async').innerText = 'Async: Connecting';
                            document.getElementById('toolbar-async').style.background = 'orange';
                            document.getElementById('toolbar-async').style.color = 'white';
                        }
                        break;

                    case 1:
                        if (confirm('Are you sure you want to disconnect async?')) {
                            asyncClient.close();
                        }
                        break;

                    case 2:
                        break;
                }
                break;

            case 'getMaps':
                getMapsList();
                break;

            case 'zoomIn':
                graph.zoomIn();
                break;

            case 'zoomOut':
                graph.zoomOut();
                break;

            case 'actualSize':
                graph.zoomActual();

                var bounds = graph.getGraphBounds();

                var w = bounds.width / graph.view.scale,
                    h = bounds.height / graph.view.scale;

                graph.view.scaleAndTranslate(1,
                    (margin + cw - w) / 2 - bounds.x / graph.view.scale,
                    (margin + ch - h) / 2 - bounds.y / graph.view.scale);
                break;

            case 'fit':
                graph.zoomActual();

                var bounds = graph.getGraphBounds();

                var w = bounds.width / graph.view.scale,
                    h = bounds.height / graph.view.scale,
                    s = Math.min(max, Math.min(cw / w, ch / h)) * .9;

                graph.view.scaleAndTranslate(s,
                    (margin + cw - w * s) / (2 * s) - bounds.x / graph.view.scale,
                    (margin + ch - h * s) / (2 * s) - bounds.y / graph.view.scale);

                break;

            case 'theme':
                changeTheme();
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
                var cellEntityId = allCells[i].getAttribute('entityId');

                if (cellEntityId > 0) {
                    if (!Array.isArray(DYNAMIC_CELLS[cellEntityId])) {
                        DYNAMIC_CELLS[cellEntityId] = [];
                    }

                    switch (allCells[i].getAttribute('type')) {
                        case 'led':
                            var ledValues = [],
                                ledColors = [],
                                ledBreakPoints = allCells[i].getAttribute('breakPoints')
                                    .split(',')
                                    .map(function(str) {
                                        ledValues.push(parseInt(str.split(':')[0].trim()));
                                        ledColors.push(str.split(':')[1].trim());
                                    });

                            if (!Array.isArray(MAP_LEDS[cellEntityId])) {
                                MAP_LEDS[cellEntityId] = [];
                            }

                            if (allCells[i].children) {
                                var children = allCells[i].children[0].children;

                                for (var j = 0; j < children.length; j++) {
                                    if (mxUtils.isNode(children[j].value)) {
                                        if (children[j].getAttribute('active') == 'yes' ||
                                            children[j].getAttribute('active')
                                                .toLowerCase() == 'true' || parseInt(children[j].getAttribute('active')) == 1) {
                                            MAP_LEDS[cellEntityId].push({
                                                cell: children[j],
                                                id: children[j].id,
                                                label: children[j].getAttribute('label'),
                                                values: ledValues,
                                                colors: ledColors
                                            });

                                            DYNAMIC_CELLS[cellEntityId].push({
                                                type: 'led',
                                                cell: children[j],
                                                id: children[j].id,
                                                label: children[j].getAttribute('label'),
                                                values: ledValues,
                                                colors: ledColors
                                            });
                                        }
                                    }
                                }
                            }
                            else {
                                MAP_LEDS[cellEntityId].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    values: ledValues,
                                    colors: ledColors
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'led',
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    values: ledValues,
                                    colors: ledColors
                                });
                            }
                            break;

                        case 'progress_bar':
                            if (cellEntityId > 0) {
                                var cellGeometry = allCells[i].getGeometry(),
                                    cellLength = (cellGeometry.height > cellGeometry.width) ? cellGeometry.height : cellGeometry.width,
                                    valueRatio = (allCells[i].getAttribute('maxValue') > 0) ? allCells[i].getAttribute('maxValue') / cellLength : 1,
                                    progressBarStops = [],
                                    progressBarColors = [],
                                    progressBarBreakPoints = allCells[i].getAttribute('breakPoints')
                                        .split(',')
                                        .map(function(str) {
                                            progressBarStops.push(str.split(':')[0].trim());
                                            progressBarColors.push(str.split(':')[1].trim());
                                        });

                                if (!Array.isArray(MAP_PROGRESS_BAR[cellEntityId])) {
                                    MAP_PROGRESS_BAR[cellEntityId] = [];
                                }

                                MAP_PROGRESS_BAR[cellEntityId].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    valueRatio: valueRatio,
                                    progressBarStops: progressBarStops,
                                    progressBarColors: progressBarColors,
                                    endPoint: {
                                        x: cellGeometry.y + cellGeometry.width,
                                        y: cellGeometry.y + cellGeometry.height
                                    },
                                    cellOrientation: (cellGeometry.height > cellGeometry.width)
                                        ? 'vertical'
                                        : 'horizontal'
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'progress_bar',
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    valueRatio: valueRatio,
                                    progressBarStops: progressBarStops,
                                    progressBarColors: progressBarColors,
                                    endPoint: {
                                        x: cellGeometry.y + cellGeometry.width,
                                        y: cellGeometry.y + cellGeometry.height
                                    },
                                    cellOrientation: (cellGeometry.height > cellGeometry.width)
                                        ? 'vertical'
                                        : 'horizontal'
                                });
                            }
                            break;

                        case 'speedometer':
                            if (cellEntityId > 0) {

                                if (!Array.isArray(MAP_SPEEDOMETER[cellEntityId])) {
                                    MAP_SPEEDOMETER[cellEntityId] = [];
                                }

                                MAP_SPEEDOMETER[cellEntityId].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    minValue: allCells[i].getAttribute('minValue'),
                                    maxValue: allCells[i].getAttribute('maxValue'),
                                    step: allCells[i].getAttribute('step'),
                                    angel: allCells[i].getAttribute('angel'),
                                    previousValue: 0
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'speedometer',
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
                            if (cellEntityId > 0) {

                                if (!Array.isArray(MAP_CELLS[cellEntityId])) {
                                    MAP_CELLS[cellEntityId] = [];
                                }

                                MAP_CELLS[cellEntityId].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    unit: allCells[i].getAttribute('unit')
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
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
        }
    }
    catch (e) {
        console.error(e);
    }

    // console.log({
    //     DYNAMIC_CELLS,
    //     MAP_CELLS,
    //     MAP_LEDS,
    //     MAP_PROGRESS_BAR,
    //     MAP_SPEEDOMETER
    // });
    //
    // fakeDataGenerator();
}

/**
 * Global Window Functions
 */

window.addEventListener('resize', function() {
    if (graph) {
        cw = graph.container.clientWidth - margin;
        ch = graph.container.clientHeight - margin;

        outlineDOM.style.width = containerDOM.getBoundingClientRect().width / 5;
        outlineDOM.style.height = containerDOM.getBoundingClientRect().height / 5;
    }
});

/**
 * Temporary Functions
 */

function fakeDataGenerator() {
    setInterval(function() {
        var data = {
            entityId: 2,//Math.ceil(Math.random() * 10),
            value: Math.floor(Math.random() * 200),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data.value;
    }, 100);
}
