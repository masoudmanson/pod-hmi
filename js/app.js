var graph,
    asyncClient,
    allCells,
    MAP_CELLS = {},
    MAP_LEDS = {},
    MAP_VISIBILITY = {},
    MAP_PROGRESS_BAR = {},
    MAP_SPEEDOMETER = {},
    MAP_BUTTONS = {},
    MAP_ACTION_CALLBACKS = {},
    MAP_CHARTS = {},
    MAP_ANIMATIONS = {},
    DYNAMIC_CELLS = {},
    MAP_DEVICES = [],
    mapData,
    chartDataArrayMaxLength,
    activeChart = null,
    chartLables = [],
    chartData = [],
    mapTheme = 'light',
    graphContainer,
    outlineContainer,
    statusContainer,
    notificationContainer,
    logButton,
    renderingPitch,
    pitchInterval,
    asyncData = {},
    notifications = [],
    asyncStatus = false,
    asyncPingInterval,
    numbersRoundPrecision,
    httpAjaxRequestInterval,
    protocolType,
    protocolParams,
    toasterParams = {},
    notificationMenuOpen = null,
    refreshingMap = false,
    pages = [],
    alarmSounds = {},
    muteAlarms = false,
    fakeDataGeneration = false;

var cw, ch,
    margin = 50,
    max = 2;

var containerDOM, outlineDOM, statusDOM;

document.addEventListener('keyup', function (e) {
    if (e.keyCode === 27) {
        closeModal();
    }
});

/**
 * Async Functions
 */

function initAsync(params) {

    /**
     * Create a new Async Instance with given parameters
     */
    asyncClient = new PodAsync(params);

    /**
     * Whenever your Async connection gets asyncReady
     * you would be abale to send messages through
     */
    asyncClient.on('asyncReady', function () {
        updateMap();
        primaryHandshake();
    });

    /**
     * Listening to messages come from async gate
     * @param   {string}    msg     Received Message From Async
     * @param   {function}  ack     Callback function responsible of returning acknowledgements
     */
    asyncClient.on('message', function (msg, ack) {
        /**
         * HMI map should be updated whenever some new
         * messages come from async gate so that the
         * map would be updated all the time
         */

        var content = JSON.parse(msg.content);

        switch (content.type) {
            // Tag Data
            case 14:
                try {
                    var newContent = JSON.parse(JSON.parse(content.content));
                }
                catch (e) {
                    console.log(e);
                }
                finally {
                    asyncData[newContent.entityId] = newContent;
                }
                break;

            // Alarms
            case 15:
                try {
                    var newContent = JSON.parse(content.content);
                }
                catch (e) {
                    console.log(e);
                }
                finally {
                    asyncData[newContent.entityId] = newContent;
                }

                handleNotifications(newContent);
                break;

            // On Alarm Acknowledge
            case 16:
                try {
                    var newContent = JSON.parse(content.content);
                }
                catch (e) {
                    console.log(e);
                }
                finally {
                    document.getElementById(newContent.entityId + '-close').disabled = false;
                }
                break;

            // On Alarm Close
            case 17:
                break;

            default:
                break;
        }
    });

    /**
     * To show Async Status, we need to get state changes of
     * async connection and display the state on the page
     */
    asyncClient.on('stateChange', function (state) {
        switch (state.socketState) {
            case 0:
                asyncStatus = false;
                document.getElementById('toolbar-async').innerText = 'Async: Connecting';
                document.getElementById('toolbar-async').style.background = 'orange';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 1:
                asyncStatus = true;
                asyncPing();

                /**
                 * Rerender Map only if async is connected
                 * Before setting new interval, we should
                 * clear previuos one to avoid conflicts
                 */
                pitchInterval && clearInterval(pitchInterval);

                pitchInterval = setInterval(function () {
                    renderLiveDataOnMapWithPitch(asyncData);
                }, renderingPitch * 1000);

                document.getElementById('toolbar-async').innerText = 'Async: Connected';
                document.getElementById('toolbar-async').style.background = 'green';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 2:
                asyncStatus = false;
                pitchInterval && clearInterval(pitchInterval);
                asyncPingInterval && clearInterval(asyncPingInterval);

                document.getElementById('toolbar-async').innerText = 'Async: Closing';
                document.getElementById('toolbar-async').style.background = 'orange';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 3:
                asyncStatus = false;
                pitchInterval && clearInterval(pitchInterval);
                asyncPingInterval && clearInterval(asyncPingInterval);

                document.getElementById('toolbar-async').innerText = 'Async: Not Connected';
                document.getElementById('toolbar-async').style.background = 'red';
                document.getElementById('toolbar-async').style.color = 'white';
                break;
        }
    });
}

function sendAsyncMessage(msg) {
    var asyncMessage = {
        type: 3,
        content: {
            peerName: protocolParams.serverName,
            content: JSON.stringify(msg)
        }
    };

    asyncClient.send(asyncMessage);
}

function initHttp(params) {
    updateMap();

    httpAjaxRequestInterval = setInterval(function () {
        let xhr = new XMLHttpRequest();
        xhr.open(params.method, params.url + '&rand=' + Math.random());
        xhr.send();
        xhr.onerror = function () {
            document.getElementById('toolbar-lastUpdate').innerText = 'Error at ' + new Date().toLocaleTimeString();
            document.getElementById('toolbar-lastUpdate').style.background = 'red';
            document.getElementById('toolbar-lastUpdate').style.color = 'white';
        };
        xhr.onload = function () {
            if (xhr.status != 200) {
                console.error(`Error ${xhr.status}: ${xhr.statusText}`);

                document.getElementById('toolbar-lastUpdate').innerText = 'Error at ' + new Date().toLocaleTimeString();
                document.getElementById('toolbar-lastUpdate').style.background = 'red';
                document.getElementById('toolbar-lastUpdate').style.color = 'white';
            }
            else {
                try {
                    var result = JSON.parse(xhr.responseText);
                    renderLiveDataOnMapWithPitch(result);

                    document.getElementById('toolbar-lastUpdate').innerText = 'Last updated at ' + new Date().toLocaleTimeString();
                    document.getElementById('toolbar-lastUpdate').style.background = 'green';
                    document.getElementById('toolbar-lastUpdate').style.color = 'white';
                }
                catch (e) {
                    console.log(e);
                }
            }
        };
    }, renderingPitch * 1000);
}

function primaryHandshake() {
    var data = {
        type: 7,
        content: ''
    };

    sendAsyncMessage(data);
}

function asyncPing() {
    asyncPingInterval && clearInterval(asyncPingInterval);

    asyncPingInterval = setInterval(function () {
        var data = {
            type: 12,
            content: ''
        };

        sendAsyncMessage(data);
    }, 20000);
}

function getMapsList() {
    // Get Maps List
    // var data = {
    //     type: 5,
    //     content: '',
    //     messageId: new Date().getTime()
    // };

    // Save Map
    // var data = {
    //     type: 3,
    //     content: {
    //         name: new Date().getTime().toString(),
    //         content: new Date().toString()
    //     }
    // };

    var data = {
        type: 3,
        content: JSON.stringify({
            name: 'Test Map',
            content: 'This is a sample string!'
        })
    };

    var asyncMessage = {
        type: 3,
        content: {
            peerName: 'fanitoring-service',
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
            if (typeof params.fakeData == "boolean") {
                fakeDataGeneration = params.fakeData;
            }

            if (typeof params.protocol == 'string') {
                protocolType = params.protocol;
            }

            if (typeof params.protocolParams == 'object') {
                protocolParams = params.protocolParams;
            }

            if (typeof params.map == 'object') {
                mapData = params.map;

                if (typeof params.map.theme == 'string') {
                    mapTheme = params.map.theme;
                }
                else {
                    mapTheme = undefined;
                }
            }

            if (typeof params.logButton == 'object') {
                logButton = params.logButton;
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

            if (typeof params.notificationContainer == 'string') {
                notificationContainer = params.notificationContainer;
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

            if (typeof params.notificationOptions == 'object') {
                toasterParams = params.notificationOptions;
                notificationMenuOpen = params.notificationOptions.enable || false;

                if (!notificationMenuOpen) {
                    document.getElementById(notificationContainer).style.display = 'none';
                }
            }

            numbersRoundPrecision = (typeof params.numbersRoundPrecision == 'number') ? params.numbersRoundPrecision : 2;
            chartDataArrayMaxLength = (typeof params.chartDataArrayMaxLength == 'number') ? params.chartDataArrayMaxLength : 20;
            chartLables = getArrayWithLimitedLength(chartDataArrayMaxLength);
            chartData = getArrayWithLimitedLength(chartDataArrayMaxLength);
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
        graph.setHtmlLabels(true);

        // graph.getModel().addListener(mxEvent.CHANGE, function(sender, evt){
        //     graph.getModel().beginUpdate();
        //     evt.consume();
        //     try {
        //     } finally {
        //         graph.getModel().endUpdate();
        //         graph.refresh();
        //     }
        // });

        graph.addMouseListener({
            mouseDown: function (sender, evt) {
                if (typeof evt.sourceState == 'object') {
                    var cell = evt.state.cell;
                    var pageLink = cell.getAttribute('link');

                    if (pageLink) {
                        if (pageLink.substring(0, 13) == 'data:page/id,') {
                            var comma = pageLink.indexOf(',');
                            var pageId = pageLink.substring(comma + 1);

                            for (var i = 0; i < pages.length; i++) {
                                if (pages[i].id == pageId) {
                                    changeMap({type: 'text', data: pages[i].data});
                                }
                            }
                        }
                    }

                    if (MAP_BUTTONS.hasOwnProperty(evt.sourceState.cell.id)) {
                        var buttonEntityId = MAP_BUTTONS[evt.sourceState.cell.id];
                        if (MAP_ACTION_CALLBACKS[buttonEntityId]) {
                            switch (MAP_ACTION_CALLBACKS[buttonEntityId].type) {
                                case 'simplePushButton':
                                    return Function(MAP_ACTION_CALLBACKS[buttonEntityId].action)();
                                    break;

                                case 'toggleButton':
                                    switch (MAP_ACTION_CALLBACKS[buttonEntityId].currentState) {
                                        case 0:
                                            MAP_ACTION_CALLBACKS[buttonEntityId].currentState = 1;
                                            var edit = new mxCellAttributeChange(evt.sourceState.cell, 'label', MAP_ACTION_CALLBACKS[buttonEntityId].states[1].title);
                                            graph.model.execute(edit);

                                            return Function(MAP_ACTION_CALLBACKS[buttonEntityId].states[0].action)();
                                            break;

                                        case 1:
                                            MAP_ACTION_CALLBACKS[buttonEntityId].currentState = 0;
                                            var edit = new mxCellAttributeChange(evt.sourceState.cell, 'label', MAP_ACTION_CALLBACKS[buttonEntityId].states[0].title);
                                            graph.model.execute(edit);

                                            return Function(MAP_ACTION_CALLBACKS[buttonEntityId].states[1].action)();
                                            break;
                                    }
                                    break;
                            }
                        }
                    }

                    if (MAP_ACTION_CALLBACKS.hasOwnProperty(evt.sourceState.cell.id)) {
                        return Function('"use strict";return (' + MAP_ACTION_CALLBACKS[evt.sourceState.cell.id] + ')')();
                    }

                    if (MAP_CHARTS.hasOwnProperty(evt.sourceState.cell.id)) {
                        showChartModal(evt.sourceState.cell.id, MAP_CHARTS[evt.sourceState.cell.id].chart, MAP_CHARTS[evt.sourceState.cell.id].entityId, MAP_CHARTS[evt.sourceState.cell.id].title, MAP_CHARTS[evt.sourceState.cell.id].maxStackSize);
                    }
                }
            },
            mouseMove: function (sender, evt) {
            },
            mouseUp: function (sender, evt) {
            }
        });

        // Render animations again on map resize or move
        graph.sizeDidChange = function () {
            // TODO: Check if this is neccessary or what?!
            // renderLiveDataOnMapWithPitch(asyncData);
        };

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
                    createGraphFromXmlFile(graph, mapXmlData);
                    break;

                case 'text':
                    createGraphFromXmlText(graph, mapXmlData);
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

        switch (protocolType) {
            case 'websockets':
                initAsync(params.protocolParams);
                break;

            case 'http':
                initHttp(params.protocolParams);
                break;
        }

        /**
         * For Mockup Tests
         * TODO : Remove at production mode
         */
        if (fakeDataGeneration) {
            updateMap();
            fakeDataGenerator();
            pitchInterval && clearInterval(pitchInterval);
            pitchInterval = setInterval(function () {
                renderLiveDataOnMapWithPitch(asyncData);
            }, renderingPitch * 1000);
        }
    }
}

function createGraphFromXmlFile(graph, filename) {
    var req = mxUtils.load(filename);
    var root = req.getDocumentElement();
    switch (root.nodeName) {
        case 'mxGraphModel':
            var dec = new mxCodec(root.ownerDocument);
            dec.decode(root, graph.getModel());
            break;

        case 'mxfile':
            var childNodes = mxUtils.getChildNodes(root);

            for (var n in childNodes) {
                var data = mxUtils.getTextContent(childNodes[n]);
                try {
                    data = atob(data);
                }
                catch (e) {
                    console.log(e);
                    return;
                }

                try {
                    data = bytesToString(pako.inflateRaw(data));
                }
                catch (e) {
                    console.log(e);
                    return;
                }

                try {
                    data = decodeURIComponent(data);
                }
                catch (e) {
                    console.log(e);
                    return;
                }

                if (data.length > 0) {
                    pages.push({
                        id: childNodes[n].id,
                        name: childNodes[n].getAttribute('name'),
                        data: data
                    });
                }
            }

            var doc = mxUtils.parseXml(pages[0].data);
            var dec = new mxCodec(doc);
            dec.decode(doc.documentElement, graph.getModel());

            break;
    }
};

function createGraphFromXmlText(graph, xmlContent) {
    var doc = mxUtils.parseXml(xmlContent);
    var dec = new mxCodec(doc);
    dec.decode(doc.documentElement, graph.getModel());
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
        if (protocolType == 'websockets') {
            addToolbarButton(graph, toolbarContainer, 'async', 'Async: Connecting', '', false);
        }
        if (protocolType == 'http') {
            addToolbarButton(graph, toolbarContainer, 'lastUpdate', 'Initializing ...', '', false);
        }
        if (notificationContainer) {
            addToolbarButton(graph, toolbarContainer, 'notifications', (notificationMenuOpen) ? 'Notifications: On' : 'Notifications: Off', '', false);
        }
        if(logButton) {
            addToolbarButton(graph, toolbarContainer, 'logButton', (logButton.title && logButton.title.length) ? logButton.title : 'See Logs', '', false);
        }
        addToolbarButton(graph, toolbarContainer, 'mute', (muteAlarms) ? 'Mute' : 'Mute', '', false);
        addToolbarButton(graph, toolbarContainer, 'mainPage', '', 'style/img/home.svg', false);
        addToolbarButton(graph, toolbarContainer, 'zoomIn', '', 'style/img/zoom-in.svg', false);
        addToolbarButton(graph, toolbarContainer, 'zoomOut', '', 'style/img/zoom-out.svg', false);
        addToolbarButton(graph, toolbarContainer, 'actualSize', '', 'style/img/full-size.svg', false);
        addToolbarButton(graph, toolbarContainer, 'fit', '', 'style/img/screen.svg', false);
        if (typeof mapData.data == 'object') {
            addToolbarButton(graph, toolbarContainer, 'theme', '', 'style/img/theme.svg', false);
        }
    }
    graph.dblClick = function (evt, cell) {
        graph.zoomIn();
    };

    return graph;
}

function renderLiveDataOnMapWithPitch(content) {
    if (!refreshingMap) {
        var model = graph.getModel();
        model.beginUpdate();

        for (var key in content) {
            var entityId = content[key].entityId,
                value = content[key].value || 0,
                type = content[key].entityType || '';

            if (activeChart && activeChart.tag == entityId) {
                var dt = new Date();
                chartLables.push((dt.getHours() < 10 ? '0' : '') + dt.getHours() + ":" + (dt.getMinutes() < 10 ? '0' : '') + dt.getMinutes() + ":" + (dt.getSeconds() < 10 ? '0' : '') + dt.getSeconds());
                chartData.push(value);
                // MAP_CHARTS[activeChart.id]['chart'].update();
                activeChart && activeChart['chart'].update();
            }

            if (DYNAMIC_CELLS[entityId]) {
                if (type === "deviceTag") {
                    for (var i = 0; i < DYNAMIC_CELLS[entityId].length; i++) {
                        if (DYNAMIC_CELLS[entityId][i].sensor == content[key].sensor) {
                            updateMapElementByType(entityId, value, i);
                        }
                    }
                } else {
                    for (var i = 0; i < DYNAMIC_CELLS[entityId].length; i++) {
                        updateMapElementByType(entityId, value, i);
                    }
                }

                // TODO to delete or not to delete :\
                // graph.refresh();
            }

            if (MAP_ACTION_CALLBACKS[entityId] && content[key].sensor == 'alarm') {
                if (MAP_ACTION_CALLBACKS[entityId].type == 'toggleButton') {
                    var buttonCELL = graph.getModel().getCell(MAP_ACTION_CALLBACKS[entityId].cellId);

                    switch (value) {
                        case 0:
                            MAP_ACTION_CALLBACKS[entityId].currentState = 0;
                            var edit = new mxCellAttributeChange(buttonCELL, 'label', MAP_ACTION_CALLBACKS[entityId].states[0].title);
                            graph.model.execute(edit);
                            break;

                        case 1:
                            MAP_ACTION_CALLBACKS[entityId].currentState = 1;
                            var edit = new mxCellAttributeChange(buttonCELL, 'label', MAP_ACTION_CALLBACKS[entityId].states[1].title);
                            graph.model.execute(edit);
                            break;
                    }
                }
            }
        }

        model.endUpdate();

        for (var key in content) {
            var entityId = content[key].entityId,
                value = content[key].value || 0,
                type = content[key].entityType || '';

            if (MAP_ANIMATIONS[entityId]) {
                for (var i = 0; i < MAP_ANIMATIONS[entityId].length; i++) {
                    switch (MAP_ANIMATIONS[entityId][i].type) {
                        case 'rotate':
                            valueIndex = MAP_ANIMATIONS[entityId][i].values.indexOf(parseInt(value));
                            var speed = (valueIndex != -1) ? parseFloat(MAP_ANIMATIONS[entityId][i].speeds[valueIndex]) : 0;
                            var direction = (MAP_ANIMATIONS[entityId][i].direction) ? MAP_ANIMATIONS[entityId][i].direction : 'cw';

                            var state = graph.view.getState(MAP_ANIMATIONS[entityId][i].cell);
                            if (state) {
                                var uniqueId = state.cell.id;
                                var oldStyle = document.getElementById(uniqueId);
                                if (oldStyle) {
                                    oldStyle.parentNode.removeChild(oldStyle);
                                }

                                if (speed) {
                                    var style = document.createElement('style');
                                    style.setAttribute('id', uniqueId);
                                    style.type = 'text/css';
                                    style.innerHTML = `.rotate-center-${uniqueId} {
                                    transform-origin: ${state.x + state.width / 2}px ${state.y + state.height / 2}px;
                                    -webkit-animation: rotate-${direction} ${1 / speed}s linear infinite;
                                    animation: rotate-${direction} ${1 / speed}s linear infinite;
                                }`;
                                    document.getElementsByTagName('head')[0].appendChild(style);

                                    // Pure Javascript
                                    state.shape.node.firstChild.classList.add('rotate-center-' + uniqueId);

                                    // MxGraph approach
                                    // var edit = new mxCellAttributeChange(state.shape.node.firstChild, 'class', 'rotate-center-' + uniqueId);
                                    // model.execute(edit);
                                }
                                else {
                                    state.shape.node.firstChild.classList.remove('rotate-center-' + uniqueId);
                                }
                            }
                            break;

                        default:
                            break;
                    }
                }
            }
        }
    }
}

function updateMapElementByType(entityId, value, index) {
    switch (DYNAMIC_CELLS[entityId][index].type) {

        case 'visibility':
            try {
                var vis = DYNAMIC_CELLS[entityId][index],
                    cell = vis.cell,
                    visOpacities = vis.opacities,
                    visValues = vis.values;

                visValueIndex = visValues.indexOf(parseInt(value));
                var opacity = visOpacities[visValueIndex];
            }
            catch (e) {
                console.error(e);
            }
            finally {
                // graph.getModel().setVisible(cell, value);
                graph.setCellStyles(mxConstants.STYLE_OPACITY, opacity, [cell]);
            }
            break;

        case 'led':
            try {
                var led = DYNAMIC_CELLS[entityId][index],
                    cell = led.cell,
                    ledColors = led.colors,
                    ledValues = led.values;

                ledValueIndex = ledValues.indexOf(parseInt(value));
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
                var progressBar = DYNAMIC_CELLS[entityId][index],
                    cell = progressBar.cell,
                    cellOrientation = progressBar.cellOrientation;
            }
            catch (e) {
                console.error(e);
            }
            finally {
                var cellGeometry = cell.getGeometry();

                if (cellOrientation == 'vertical') {
                    cellGeometry.height = (value - progressBar.valueMin) / progressBar.valueRatio;
                    cellGeometry.y = progressBar.endPoint.y - ((value - progressBar.valueMin) / progressBar.valueRatio);
                }
                else {
                    cellGeometry.width = (value - progressBar.valueMin) / progressBar.valueRatio;
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
                var speedometer = DYNAMIC_CELLS[entityId][index],
                    cell = speedometer.cell;
            }
            catch (e) {
                console.error(e);
            }
            finally {
                var cellGeometry = cell.getGeometry();

                var angel = ((value - speedometer.previousValue) * speedometer.angel) / speedometer.maxValue - speedometer.minValue;

                cellGeometry.rotate(angel, cellGeometry.sourcePoint);

                DYNAMIC_CELLS[entityId][index].previousValue = value;
                cell.setAttribute('previousValue', value);

                graph.getView().clear(cell, false, false);
                graph.getView().validate();

                // var state = graph.view.getState(cell);
                //
                // if (state) {
                //     var cssStyle = `
                //         transform-origin: ${state.origin.x}px ${state.origin.y}px;
                //         -webkit-transform: rotate(${angel}deg);
                //         transform: rotate(${angel}deg);
                //     `;
                //
                //     var edit = new mxCellAttributeChange(cell, 'style', cssStyle);
                //     graph.model.execute(edit);
                //
                //     graph.getView().clear(cell, false, false);
                //     graph.getView().validate();
                //
                //     // Pure Javascript
                //     // state.shape.node.firstChild.classList.add('rotate-center-' + uniqueId);
                // }
            }
            break;

        default:
            try {
                var customNode = DYNAMIC_CELLS[entityId][index],
                    cell = customNode.cell,
                    unit = customNode.unit || '';

                var label = cell.getAttribute('label');
                if (!isNaN(value)) {
                    var newValue = Math.round(value * Math.pow(10, numbersRoundPrecision)) / Math.pow(10, numbersRoundPrecision) + ' ' + unit;
                } else {
                    var newValue = value + ' ' + unit;
                }

                if (label.indexOf('<') != -1) {
                    var regex = /[>]([^<\n]+?)[<]/gm;
                    var result = label.match(regex);

                    if (result.length == 1) {
                        var newLabel = label.replace(new RegExp(regex), '>' + newValue.toString() + '<');
                        var edit = new mxCellAttributeChange(cell, 'label', newLabel);
                        graph.model.execute(edit);
                    }
                    else {
                        var start = label.indexOf(result[0]);
                        var end = label.indexOf(result[result.length - 1]);
                        var newLabel = label.substr(0, start + 1) + newValue.toString() +
                            label.substring(end + result[result.length - 1].length - 1, label.length);
                        var edit = new mxCellAttributeChange(cell, 'label', newLabel);
                        graph.model.execute(edit);
                    }
                }
                else {
                    var edit = new mxCellAttributeChange(cell, 'label', newValue);
                    graph.model.execute(edit);
                }
            }
            catch (e) {
                console.error(e);
            }
            break;
    }
}

function changeMap(data) {
    refreshingMap = true;

    var mapXmlData = (data && typeof data.data == 'string') ? data.data : null;
    var mapXmlType = (data && typeof data.type == 'string') ? data.type : mapData.type;

    if (!mapXmlData) {
        if (mapTheme == 'light' && mapData.data.hasOwnProperty('dark')) {
            mapTheme = 'dark';
            mapXmlData = mapData.data['dark'];
        }
        else if (mapTheme == 'dark' && mapData.data.hasOwnProperty('light')) {
            mapTheme = 'light';
            mapXmlData = mapData.data['light'];
        }
    }

    graph.getModel()
        .beginUpdate();

    try {
        // switch (mapData.type) {
        switch (mapXmlType) {
            case 'file':
                createGraphFromXmlFile(graph, mapXmlData);
                break;

            case 'text':
                createGraphFromXmlText(graph, mapXmlData);
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
        refreshingMap = false;
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

    mxEvent.addListener(button, 'click', function (evt) {
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

            case 'notifications':
                switch (notificationMenuOpen) {
                    case true:
                        document.getElementById(notificationContainer).style.display = 'none';
                        notificationMenuOpen = false;
                        document.getElementById('toolbar-notifications').innerText = 'Notifications: Off';
                        Toastify.reposition();

                        muteAlarms = true;
                        for (var i in alarmSounds) {
                            try {
                                alarmSounds[i].stop(0);
                                delete(alarmSounds[i]);
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        document.getElementById('toolbar-mute').innerText = 'Unmute';
                        break;

                    case false:
                        document.getElementById(notificationContainer).style.display = 'block';
                        notificationMenuOpen = true;
                        document.getElementById('toolbar-notifications').innerText = 'Notifications: On';
                        Toastify.reposition();


                        muteAlarms = false;
                        for (var i in alarmSounds) {
                            try {
                                alarmSounds[i].start(0);
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        document.getElementById('toolbar-mute').innerText = 'Mute';
                        break;

                }
                break;

            case 'mute':
                switch (muteAlarms) {
                    case true:
                        muteAlarms = false;
                        for (var i in alarmSounds) {
                            try {
                                alarmSounds[i].start(0);
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        document.getElementById('toolbar-mute').innerText = 'Mute';
                        break;

                    case false:
                        muteAlarms = true;
                        for (var i in alarmSounds) {
                            try {
                                alarmSounds[i].stop(0);
                                delete(alarmSounds[i]);
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        document.getElementById('toolbar-mute').innerText = 'Unmute';
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
                changeMap();
                break;

            case 'mainPage':
                if (pages.length > 1) {
                    changeMap({
                        type: 'text',
                        data: pages[0].data
                    });
                }
                break;

            case 'logButton':
                switch(logButton.type) {
                    case 'tab':
                        window.open(logButton.url);
                        break;

                    case 'window':
                        centeredPopUpWindow(logButton.url, 80, 60);
                        break;
                }
                break;
        }
    });
    mxUtils.write(button, label);
    toolbar.appendChild(button);
};

function centeredPopUpWindow(url, widthPercentage, heightPercentage) {
    var leftPosition, topPosition;
    popUpWidth = (window.screen.width * widthPercentage) / 100;
    popUpHeight = (window.screen.height * heightPercentage) / 100;

    leftPosition = (window.screen.width / 2) - ((popUpWidth / 2) + 10);
    topPosition = (window.screen.height / 2) - ((popUpHeight / 2) + 50);

    window.open(url, "Window2",
        "status=no,height=" + popUpHeight + ",width=" + popUpWidth + ",resizable=yes,left="
        + leftPosition + ",top=" + topPosition + ",screenX=" + leftPosition + ",screenY="
        + topPosition + ",toolbar=no,menubar=no,scrollbars=no,location=no,directories=no");
}

function emptyAllMapObjects() {
    DYNAMIC_CELLS = {};
    MAP_ANIMATIONS = {};
    MAP_CELLS = {};
    MAP_LEDS = {};
    MAP_PROGRESS_BAR = {};
    MAP_SPEEDOMETER = {};
    MAP_VISIBILITY = {};
}

function updateMap() {
    emptyAllMapObjects();

    allCells = Object.values(graph.getModel().cells);

    try {
        for (var i = 0; i < allCells.length; i++) {
            if (mxUtils.isNode(allCells[i].value)) {
                var cellEntityId = allCells[i].getAttribute('entityId'),
                    cellUniqueId = allCells[i].getId(),
                    cellType = allCells[i].getAttribute('type');


                /**
                 * If the tag is a device sensor tag, we have to set
                 */
                if (allCells[i].getAttribute('sensorType') == 'deviceSensor') {
                    if (!MAP_DEVICES.hasOwnProperty(cellEntityId)) {
                        MAP_DEVICES[cellEntityId] = {};
                        getDataForDevice(cellEntityId);
                    }
                }

                if (allCells[i].getAttribute('onClick') != undefined) {
                    MAP_ACTION_CALLBACKS[allCells[i].id] = allCells[i].getAttribute('onClick');
                }

                if (allCells[i].getAttribute('tagChart') != undefined && MAP_CHARTS[allCells[i].id] == undefined) {
                    MAP_CHARTS[allCells[i].id] = JSON.parse(allCells[i].getAttribute('tagChart'));
                }

                if (cellEntityId) {
                    if (!Array.isArray(DYNAMIC_CELLS[cellEntityId])) {
                        DYNAMIC_CELLS[cellEntityId] = [];
                    }
                    var tagConnections = allCells[i].getAttribute('tagConnections');
                    try {
                        tagConnections = JSON.parse(tagConnections);
                    }
                    catch (e) {
                        console.log(e);
                    }
                    finally {
                        switch (cellType) {
                            case 'visibility':
                                var visValues = [],
                                    visOpacities = [],
                                    visBreakPoints = JSON.parse(tagConnections.breakPoints),
                                    sensorName = (typeof tagConnections.sensor == 'string') ? tagConnections.sensor : '';

                                for (var b in visBreakPoints) {
                                    visValues.push(parseFloat(b));
                                    visOpacities.push(visBreakPoints[b]);
                                }

                                if (!Array.isArray(MAP_VISIBILITY[cellEntityId])) {
                                    MAP_VISIBILITY[cellEntityId] = [];
                                }

                                MAP_VISIBILITY[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    values: visValues,
                                    opacities: visOpacities
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'visibility',
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    values: visValues,
                                    opacities: visOpacities
                                });

                                break;

                            case 'led':
                                var ledValues = [],
                                    ledColors = [],
                                    ledBreakPoints = JSON.parse(tagConnections.breakPoints),
                                    sensorName = (typeof tagConnections.sensor == 'string') ? tagConnections.sensor : '';

                                for (var b in ledBreakPoints) {
                                    ledValues.push(parseFloat(b));
                                    ledColors.push(ledBreakPoints[b]);
                                }

                                if (!Array.isArray(MAP_LEDS[cellEntityId])) {
                                    MAP_LEDS[cellEntityId] = [];
                                }

                                MAP_LEDS[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    values: ledValues,
                                    colors: ledColors
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'led',
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    values: ledValues,
                                    colors: ledColors
                                });

                                break;

                            case 'progress_bar':
                                var cellGeometry = allCells[i].getGeometry(),
                                    cellLength = (tagConnections.orientation == 'vertical') ? cellGeometry.height : cellGeometry.width,
                                    initialLength = (allCells[i].getAttribute('initialLength') && allCells[i].getAttribute('initialLength') > 0)
                                        ? allCells[i].getAttribute('initialLength')
                                        : cellLength,
                                    valueMin = (!isNaN(tagConnections.minValue)) ? tagConnections.minValue : 0,
                                    valueMax = (!isNaN(tagConnections.maxValue)) ? tagConnections.maxValue : 0,
                                    valueRatio = (Math.abs(valueMax) > 0) ? Math.abs(valueMax - valueMin) / initialLength : 1,
                                    progressBarStops = [],
                                    progressBarColors = [],
                                    progressBarBreakPoints = JSON.parse(tagConnections.breakPoints),
                                    sensorName = (typeof tagConnections.sensor == 'string') ? tagConnections.sensor : '';

                                if (allCells[i].getAttribute('initialLength') == undefined) {
                                    allCells[i].setAttribute('initialLength', cellLength);
                                }

                                for (var b in progressBarBreakPoints) {
                                    progressBarStops.push(parseFloat(b));
                                    progressBarColors.push(progressBarBreakPoints[b]);
                                }

                                if (typeof MAP_PROGRESS_BAR[cellEntityId] != "object") {
                                    MAP_PROGRESS_BAR[cellEntityId] = {};
                                }

                                MAP_PROGRESS_BAR[cellEntityId][cellUniqueId] = {
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    initialLength: initialLength,
                                    valueRatio: valueRatio,
                                    valueMin: valueMin,
                                    progressBarStops: progressBarStops,
                                    progressBarColors: progressBarColors,
                                    endPoint: {
                                        x: cellGeometry.y + cellGeometry.width,
                                        y: cellGeometry.y + cellGeometry.height
                                    },
                                    cellOrientation: tagConnections.orientation
                                };

                                DYNAMIC_CELLS[cellEntityId].push({
                                    type: 'progress_bar',
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    valueRatio: valueRatio,
                                    valueMin: valueMin,
                                    initialLength: initialLength,
                                    progressBarStops: progressBarStops,
                                    progressBarColors: progressBarColors,
                                    endPoint: {
                                        x: cellGeometry.y + cellGeometry.width,
                                        y: cellGeometry.y + cellGeometry.height
                                    },
                                    cellOrientation: tagConnections.orientation
                                });

                                break;

                            case 'speedometer':
                                var sensorName = (typeof tagConnections.sensor == 'string') ? tagConnections.sensor : '',
                                    previousValue = (allCells[i].getAttribute('previousValue') && !isNaN(allCells[i].getAttribute('previousValue')))
                                        ? allCells[i].getAttribute('previousValue')
                                        : 0;

                                if (!Array.isArray(MAP_SPEEDOMETER[cellEntityId])) {
                                    MAP_SPEEDOMETER[cellEntityId] = [];
                                }

                                if (allCells[i].getAttribute('previousValue') == undefined) {
                                    allCells[i].setAttribute('previousValue', cellLength);
                                }

                                MAP_SPEEDOMETER[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    minValue: tagConnections.minValue,
                                    maxValue: tagConnections.maxValue,
                                    step: tagConnections.step,
                                    angel: tagConnections.angel,
                                    previousValue: previousValue
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    type: 'speedometer',
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    minValue: tagConnections.minValue,
                                    maxValue: tagConnections.maxValue,
                                    step: tagConnections.step,
                                    angel: tagConnections.angel,
                                    previousValue: previousValue
                                });
                                break;

                            case 'text':
                                var sensorName = (typeof tagConnections.sensor == 'string') ? tagConnections.sensor : '';

                                if (!Array.isArray(MAP_CELLS[cellEntityId])) {
                                    MAP_CELLS[cellEntityId] = [];
                                }

                                MAP_CELLS[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    unit: tagConnections.unit
                                });

                                DYNAMIC_CELLS[cellEntityId].push({
                                    sensorType: allCells[i].getAttribute('sensorType'),
                                    sensor: sensorName,
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    unit: tagConnections.unit
                                });
                                break;
                        }
                    }

                    if (allCells[i].getAttribute('animation')) {
                        var tagAnimations = allCells[i].getAttribute('tagAnimations');
                        try {
                            tagAnimations = JSON.parse(tagAnimations);
                        }
                        catch (e) {
                            console.log(e);
                        }
                        finally {
                            switch (tagAnimations.animation) {
                                case 'rotate':
                                    var rotateValues = [],
                                        rotateSpeeds = [],
                                        rotateBreakPoints = JSON.parse(tagAnimations.rotateBreakPoints);

                                    for (var b in rotateBreakPoints) {
                                        rotateValues.push(parseFloat(b));
                                        rotateSpeeds.push(rotateBreakPoints[b]);
                                    }

                                    if (!Array.isArray(MAP_ANIMATIONS[cellEntityId])) {
                                        MAP_ANIMATIONS[cellEntityId] = [];
                                    }

                                    MAP_ANIMATIONS[cellEntityId].push({
                                        type: 'rotate',
                                        cell: allCells[i],
                                        id: allCells[i].id,
                                        label: allCells[i].getAttribute('label'),
                                        values: rotateValues,
                                        speeds: rotateSpeeds
                                    });

                                    break;

                                default:
                                    break;
                            }
                        }
                    }
                }

                if (allCells[i].getAttribute('button')) {
                    var tagButtons = allCells[i].getAttribute('tagButtons');
                    try {
                        tagButtons = JSON.parse(tagButtons);
                    }
                    catch (e) {
                        console.log(e);
                    }
                    finally {
                        switch (allCells[i].getAttribute('button')) {

                            case 'simplePushButton':
                                MAP_ACTION_CALLBACKS[tagButtons.entityId] = {
                                    type: 'simplePushButton',
                                    cellId: cellUniqueId,
                                    action: tagButtons.action,
                                    title: tagButtons.title
                                };

                                MAP_BUTTONS[allCells[i].id] = tagButtons.entityId;
                                var edit = new mxCellAttributeChange(allCells[i], 'label', tagButtons.title);
                                graph.model.execute(edit);
                                break;

                            case 'toggleButton':
                                MAP_ACTION_CALLBACKS[tagButtons.entityId] = {
                                    type: 'toggleButton',
                                    cellId: cellUniqueId,
                                    currentState: 0,
                                    states: [
                                        {
                                            action: tagButtons.stateOneAction,
                                            title: tagButtons.stateOneTitle
                                        },
                                        {
                                            action: tagButtons.stateTwoAction,
                                            title: tagButtons.stateTwoTitle
                                        }
                                    ]
                                };

                                MAP_BUTTONS[allCells[i].id] = tagButtons.entityId;
                                var edit = new mxCellAttributeChange(allCells[i], 'label', tagButtons.stateOneTitle);
                                graph.model.execute(edit);
                                break;

                            default:
                                break;
                        }
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
    //     MAP_ANIMATIONS,
    //     MAP_CELLS,
    //     MAP_LEDS,
    //     MAP_PROGRESS_BAR,
    //     MAP_SPEEDOMETER,
    //     MAP_VISIBILITY,
    //     MAP_DEVICES,
    //     MAP_ACTION_CALLBACKS,
    //     MAP_BUTTONS,
    //     MAP_CHARTS
    // });
}

function handleNotifications(alarm) {
    Toastify({
        selector: 'notificationContainer',
        text: alarm.message,
        time: toasterTime(alarm.dateTime),
        typeText: alarm.alarmType,
        duration: toasterParams.duration || 5000,
        close: toasterParams.closeBtn,
        autoClose: toasterParams.autoClose,
        gravity: toasterParams.positionVertical || 'bottom',
        positionLeft: (typeof toasterParams.positionHorizontal == 'string') ? toasterParams.positionHorizontal == 'left' : true,
        className: (typeof alarm.alarmType == 'string') ? 'toastify-' + alarm.alarmType : 'toastify-warning',
        callback: function () {
        },
        actions: {
            mute: {
                id: alarm.id,
                name: 'Mute!',
                callback: function () {
                    muteAlarm(alarm.id);
                }
            },
            acknowledge: {
                id: alarm.id,
                name: 'Send Ack',
                callback: function () {
                    sendAlarmAcknowledge(alarm.id);
                }
            },
            close: {
                id: alarm.id,
                name: 'Close',
                disable: !alarm.acknowledged,
                callback: function (event) {
                    sendAlarmClose(alarm.id);
                    event.target.parentElement.parentElement.removeChild(event.target.parentElement);
                    Toastify.reposition();
                }
            }
            // forceClose: {
            //     id: alarm.id,
            //     name: 'Force Close!',
            //     callback: function(event) {
            //         event.target.parentElement.parentElement.removeChild(event.target.parentElement);
            //         Toastify.reposition();
            //     }
            // }
        }
    })
        .showToast(function (element) {
            notifications.push(element);
        });
}

function muteAlarm(id) {
    if (id > 0 && alarmSounds[id]) {
        alarmSounds[id].stop(0);
        delete(alarmSounds[id]);
    }
}

function sendAlarmAcknowledge(id) {
    var data = {
        type: 16,
        content: JSON.stringify({
            entityId: id,
            userId: 1
        })
    };

    sendAsyncMessage(data);
    document.getElementById(id + '-close').disabled = false;

    // Turn alarms off
    if (id > 0 && alarmSounds[id]) {
        alarmSounds[id].stop(0);
        delete(alarmSounds[id]);
    }
}

function sendAlarmClose(id) {
    var data = {
        type: 17,
        content: JSON.stringify({
            entityId: id,
            userId: 1
        })
    };

    sendAsyncMessage(data);
}

/**
 * Live Charting Functions
 */

function showChartModal(id, type, tag, title, maxStackSize) {
    var customStackSize = (maxStackSize > 0) ? maxStackSize : chartDataArrayMaxLength;
    chartData = getArrayWithLimitedLength(customStackSize);
    chartLables = getArrayWithLimitedLength(customStackSize);
    activeChart = null;

    var modal = document.createElement('div');
    modal.className += 'chartModalWrapper';

    var ctx = document.createElement('canvas');
    ctx.setAttribute('id', id);
    ctx.setAttribute('width', 400);
    ctx.setAttribute('height', 300);
    modal.appendChild(ctx);

    var deleteButton = document.createElement('span');
    deleteButton.className += 'chartModalDelete';
    modal.appendChild(deleteButton);

    deleteButton.addEventListener('click', function (e) {
        closeModal();
    });

    activeChart = {'tag': tag, 'id': id};

    activeChart['chart'] = new Chart(ctx, {
        type: type,
        data: {
            labels: chartLables,
            datasets: [{
                label: title,
                data: chartData,
                // backgroundColor: [
                //     'rgba(255, 99, 132, 0.2)'
                // ],
                // borderColor: [
                //     'rgba(255, 99, 132, 1)'
                // ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true
                    }
                }]
            }
        }
    });

    var overlay = document.createElement('div');
    overlay.className += "has-overlay";
    overlay.addEventListener('click', function (e) {
        closeModal();
    });

    document.body.append(overlay);
    document.body.append(modal);
}

function closeModal() {
    var modalElement = document.querySelector('.chartModalWrapper');

    if (modalElement) {
        modalElement.remove();
        document.querySelector('.has-overlay').remove();

        chartData = getArrayWithLimitedLength(chartDataArrayMaxLength);
        chartLables = getArrayWithLimitedLength(chartDataArrayMaxLength);
        activeChart = null;
    }
}

/**
 * Global Window Functions
 */

window.addEventListener('resize', function () {
    if (graph) {
        cw = graph.container.clientWidth - margin;
        ch = graph.container.clientHeight - margin;

        outlineDOM.style.width = containerDOM.getBoundingClientRect().width / 5;
        outlineDOM.style.height = containerDOM.getBoundingClientRect().height / 5;
    }
});

/**
 * Helper Functions
 */

function fakeDataGenerator() {
    setInterval(function () {
        var data = {
            entityType: 'tag',
            entityId: '16',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '17',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '36',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '37',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '32',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;
        data = {
            entityType: 'tag',
            entityId: '33',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '34',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '35',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '22',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            entityType: 'tag',
            entityId: '23',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '10',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '20',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '21',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '11',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '12',
            value: Math.random() * 2,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '13',
            value: Math.random() * 2,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '24',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        // Rotating element
        var data = {
            entityType: 'tag',
            entityId: '25',
            value: Math.floor(Math.random() * 3),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '14',
            value: Math.random() * 50,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            entityType: 'tag',
            entityId: '15',
            value: Math.random() * 50,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;
    }, 100);

    // setInterval(function() {
    //     var types = ['danger', 'warning', 'info', ''];
    //
    //     var alarmType = types[Math.floor(Math.random() * 4)];
    //     var alarmId = Math.floor(Math.random() * 10000);
    //
    //     var data = {
    //         entityType: 'alarm',
    //         entityId: Math.floor(Math.random() * 10000),
    //         id: alarmId,
    //         value: Math.random() * 50,
    //         message: 'This is a random message at ' + new Date().toLocaleDateString() + ' - ' + new Date().toLocaleTimeString(),
    //         dateTime: Date.now(),
    //         alarmType: alarmType
    //     };
    //     handleNotifications(data);
    //
    //     if (alarmType == 'danger') {
    //         playSound('siren', {alarmId: alarmId});
    //     }
    //     else if (alarmType == 'warning') {
    //         playSound('gas', {alarmId: alarmId});
    //     }
    // }, 10000);
}

function bytesToString(arr) {
    var str = '';

    for (var i = 0; i < arr.length; i++) {
        str += String.fromCharCode(arr[i]);
    }

    return str;
};

function monthName(month, short) {
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    if (short) {
        return months[month].substring(0, 3);
    }
    else {
        return months[month];
    }
}

function toasterTime(timestamp) {
    return new Date(timestamp).getDate() + ' ' +
        monthName(new Date(timestamp).getMonth()) + ' ' +
        new Date(timestamp).getFullYear() + ' at ' +
        new Date(timestamp).toLocaleTimeString();
}

function getArrayWithLimitedLength(length) {
    var array = new Array();

    array.push = function () {
        if (this.length >= length) {
            this.shift();
        }
        return Array.prototype.push.apply(this, arguments);
    }

    return array;
}

/**
 * Sound Functions
 */

var sounds = {
    'fire': {
        url: 'sounds/Fire Alarm.mp3'
    },
    'danger': {
        url: 'sounds/Danger Alarm.mp3'
    },
    'gas': {
        url: 'sounds/Carbon Monoxide Detector.mp3'
    },
    'siren': {
        url: 'sounds/Air Raid Synthesized.mp3'
    }
};

var soundContext = new AudioContext();

for (var key in sounds) {
    loadSound(key);
}

function loadSound(name) {
    var sound = sounds[name];

    var url = sound.url;
    var buffer = sound.buffer;

    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = function () {
        soundContext.decodeAudioData(request.response, function (newBuffer) {
            sound.buffer = newBuffer;
        });
    };

    request.send();
}

function playSound(name, options) {
    var sound = sounds[name];
    var soundVolume = sounds[name].volume || 1;

    var buffer = sound.buffer;
    if (buffer) {
        alarmSounds[options.alarmId] = soundContext.createBufferSource();
        alarmSounds[options.alarmId].buffer = buffer;
        alarmSounds[options.alarmId].loop = true;

        var volume = soundContext.createGain();

        if (options) {
            if (options.volume) {
                volume.gain.value = soundVolume * options.volume;
            }
        }
        else {
            volume.gain.value = soundVolume;
        }

        volume.connect(soundContext.destination);

        alarmSounds[options.alarmId].connect(volume);

        if (!muteAlarms) {
            alarmSounds[options.alarmId].start(0);
            alarmSounds[options.alarmId].onended = function (event) {
                //TODO Clear this audio from memory
            };
        }
    }
}
