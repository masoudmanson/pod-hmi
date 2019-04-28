var graph,
    asyncClient,
    allCells,
    MAP_CELLS = {},
    MAP_LEDS = {},
    MAP_VISIBILITY = {},
    MAP_PROGRESS_BAR = {},
    MAP_SPEEDOMETER = {},
    MAP_CALLBACKS = {},
    MAP_ANIMATIONS = {},
    DYNAMIC_CELLS = {},
    mapData,
    mapTheme = 'light',
    graphContainer,
    outlineContainer,
    statusContainer,
    notificationContainer,
    renderingPitch,
    pitchInterval,
    asyncData = {},
    notifications = [],
    asyncStatus = false,
    numbersRoundPrecision,
    httpAjaxRequestInterval,
    protocolType,
    protocolParams,
    toasterParams = {},
    notificationMenuOpen = null,
    openNotifyMenu;

var cw, ch,
    margin = 50,
    max = 2;

var containerDOM, outlineDOM, statusDOM;

/**
 * Extending Array push
 */
notifications.push = function () {
    // var element = document.getElementById(notificationContainer);
    // element.insertBefore(arguments[0], element.firstChild);
    // Toastify.reposition();
    return Array.prototype.push.apply(this,arguments);
}

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

        if (content.type.toLowerCase() == 'alarm') {
            handleNotifications(content);
        } else {
            asyncData[content.entityId] = content;
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
                // pitchInterval && clearInterval(pitchInterval);
                document.getElementById('toolbar-async').innerText = 'Async: Closing';
                document.getElementById('toolbar-async').style.background = 'orange';
                document.getElementById('toolbar-async').style.color = 'white';
                break;

            case 3:
                asyncStatus = false;
                // pitchInterval && clearInterval(pitchInterval);
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
        }
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
            if (typeof params.protocol == 'string') {
                protocolType = params.protocol;
            }

            if(typeof params.protocolParams == 'object') {
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

            if(typeof params.notificationOptions == 'object') {
                toasterParams = params.notificationOptions;
                notificationMenuOpen = params.notificationOptions.enable || false;

                if(!notificationMenuOpen) {
                    document.getElementById(notificationContainer).style.display = 'none';
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

        graph.addMouseListener({
            mouseDown: function (sender, evt) {
                if (typeof evt.sourceState == 'object' && MAP_CALLBACKS.hasOwnProperty(evt.sourceState.cell.id)) {
                    eval(MAP_CALLBACKS[evt.sourceState.cell.id]);
                }
            },
            mouseMove: function (sender, evt) {
            },
            mouseUp: function (sender, evt) {
            }
        });

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
         */
        updateMap();
        // fakeDataGenerator();
        pitchInterval && clearInterval(pitchInterval);
        pitchInterval = setInterval(function () {
            renderLiveDataOnMapWithPitch(asyncData);
        }, renderingPitch * 1000);
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
            var diagrams = [];
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
                    diagrams.push(data);
                }
            }

            //TODO pagination between maps
            var doc = mxUtils.parseXml(diagrams[0]);
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
        if(notificationContainer) {
            addToolbarButton(graph, toolbarContainer, 'notifications', (notificationMenuOpen) ? 'Notifications: On' : 'Notifications: Off', '', false);
        }
        addToolbarButton(graph, toolbarContainer, 'zoomIn', '', 'style/img/zoom-in.svg', false);
        addToolbarButton(graph, toolbarContainer, 'zoomOut', '', 'style/img/zoom-out.svg', false);
        addToolbarButton(graph, toolbarContainer, 'actualSize', '', 'style/img/full-size.svg', false);
        addToolbarButton(graph, toolbarContainer, 'fit', '', 'style/img/screen.svg', false);
        if (typeof mapData.data == 'object') {
            addToolbarButton(graph, toolbarContainer, 'theme', '', 'style/img/theme.svg', false);
        }
        // addToolbarButton(graph, toolbarContainer, 'getMaps', 'Get Maps List', '', false);
    }
    graph.dblClick = function (evt, cell) {
        graph.zoomIn();
    };

    return graph;
}

function renderLiveDataOnMapWithPitch(content) {
    var model = graph.getModel();

    model.beginUpdate();

    for (var key in content) {
        var entityId = content[key].entityId,
            value = content[key].value,
            type = content[key].type;

        if (type.toLowerCase() == 'alarm') {
            console.log('Alarm received', content[key]);
            handleNotifications(content[key]);
        } else {
            if (DYNAMIC_CELLS[entityId]) {
                for (var i = 0; i < DYNAMIC_CELLS[entityId].length; i++) {
                    switch (DYNAMIC_CELLS[entityId][i].type) {

                        case 'visibility':
                            try {
                                var vis = DYNAMIC_CELLS[entityId][i],
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
                                var led = DYNAMIC_CELLS[entityId][i],
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
                                // graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [cell]);
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

                                var label = cell.getAttribute('label');
                                var newValue = Math.round(value * Math.pow(10, numbersRoundPrecision)) / Math.pow(10, numbersRoundPrecision) + ' ' + unit;

                                if (label.indexOf('<') != -1) {
                                    var regex = /[>]([^<\n]+?)[<]/gm;
                                    var result = label.match(regex);

                                    if (result.length == 1) {
                                        var mim = label.replace(new RegExp(regex), '>' + newValue.toString() + '<');
                                        cell.value.setAttribute('label', mim);
                                    }
                                    else {
                                        var start = label.indexOf(result[0]);
                                        var end = label.indexOf(result[result.length - 1]);
                                        var newLabel = label.substr(0, start + 1) + newValue.toString() +
                                            label.substring(end + result[result.length - 1].length - 1, label.length);
                                        cell.value.setAttribute('label', newLabel);
                                    }
                                }
                                else {
                                    cell.value.setAttribute('label', newValue);
                                }
                            }
                            catch (e) {
                                console.error(e);
                            }
                            break;
                    }
                }
            }
        }
        // if(MAP_ANIMATIONS[entityId]) {
        //     for (var i = 0; i < MAP_ANIMATIONS[entityId].length; i++) {
        //         console.log("Do this animation for fucks sake", MAP_ANIMATIONS[entityId], entityId);
        //     }
        // }
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
                        break;

                    case false:
                        document.getElementById(notificationContainer).style.display = 'block';
                        notificationMenuOpen = true;
                        document.getElementById('toolbar-notifications').innerText = 'Notifications: On';
                        Toastify.reposition();
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
    DYNAMIC_CELLS = {};
    allCells = Object.values(graph.getModel().cells);

    try {
        for (var i = 0; i < allCells.length; i++) {
            if (mxUtils.isNode(allCells[i].value)) {
                var cellEntityId = allCells[i].getAttribute('entityId');

                if (allCells[i].getAttribute('onClick') != undefined) {
                    MAP_CALLBACKS[allCells[i].id] = allCells[i].getAttribute('onClick');
                    // console.log(allCells[i].getAttribute('onClick'));
                    // console.log(typeof allCells[i].getAttribute('onClick'));
                    //
                    // var target = allCells[i];
                    //
                    // mxEvent.addListener(target, 'click', function() {
                    //     eval(allCells[i].getAttribute('onClick'));
                    // });
                }

                if (cellEntityId != '') {
                    if (!Array.isArray(DYNAMIC_CELLS[cellEntityId])) {
                        DYNAMIC_CELLS[cellEntityId] = [];
                    }

                    switch (allCells[i].getAttribute('type')) {
                        case 'visibility':
                            var visValues = [],
                                visOpacities = [];

                            allCells[i].getAttribute('breakPoints')
                                .split(',')
                                .map(function (str) {
                                    visValues.push(parseInt(str.split(':')[0].trim()));
                                    visOpacities.push(str.split(':')[1].trim());
                                });

                            if (!Array.isArray(MAP_VISIBILITY[cellEntityId])) {
                                MAP_VISIBILITY[cellEntityId] = [];
                            }

                            MAP_VISIBILITY[cellEntityId].push({
                                cell: allCells[i],
                                id: allCells[i].id,
                                values: visValues,
                                opacities: visOpacities
                            });

                            DYNAMIC_CELLS[cellEntityId].push({
                                type: 'visibility',
                                cell: allCells[i],
                                id: allCells[i].id,
                                values: visValues,
                                opacities: visOpacities
                            });

                            break;

                        case 'led':
                            var ledValues = [],
                                ledColors = [],
                                ledBreakPoints = allCells[i].getAttribute('breakPoints')
                                    .split(',')
                                    .map(function (str) {
                                        ledValues.push(parseInt(str.split(':')[0].trim()));
                                        ledColors.push(str.split(':')[1].trim());
                                    });

                            if (!Array.isArray(MAP_LEDS[cellEntityId])) {
                                MAP_LEDS[cellEntityId] = [];
                            }

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

                            break;

                        case 'progress_bar':
                            var cellGeometry = allCells[i].getGeometry(),
                                cellLength = (cellGeometry.height > cellGeometry.width) ? cellGeometry.height : cellGeometry.width,
                                initialLength = (MAP_PROGRESS_BAR[cellEntityId] && MAP_PROGRESS_BAR[cellEntityId][0].initialLength > 0)
                                    ? MAP_PROGRESS_BAR[cellEntityId][0].initialLength
                                    : cellLength,
                                valueRatio = (allCells[i].getAttribute('maxValue') > 0) ? allCells[i].getAttribute('maxValue') / initialLength : 1,
                                progressBarStops = [],
                                progressBarColors = [],
                                progressBarBreakPoints = allCells[i].getAttribute('breakPoints')
                                    .split(',')
                                    .map(function (str) {
                                        progressBarStops.push(str.split(':')[0].trim());
                                        progressBarColors.push(str.split(':')[1].trim());
                                    });

                            if (!Array.isArray(MAP_PROGRESS_BAR[cellEntityId])) {
                                MAP_PROGRESS_BAR[cellEntityId] = [];

                                MAP_PROGRESS_BAR[cellEntityId].push({
                                    cell: allCells[i],
                                    id: allCells[i].id,
                                    label: allCells[i].getAttribute('label'),
                                    initialLength: initialLength,
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

                            DYNAMIC_CELLS[cellEntityId].push({
                                type: 'progress_bar',
                                cell: allCells[i],
                                id: allCells[i].id,
                                label: allCells[i].getAttribute('label'),
                                valueRatio: valueRatio,
                                initialLength: initialLength,
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
                            break;

                        case 'speedometer':
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
                            break;

                        default:
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
                            break;
                    }

                    // if(allCells[i].getAttribute('animation')) {
                    //     console.log(allCells[i].getAttribute('id'));
                    //     MAP_ANIMATIONS[cellEntityId] = allCells[i].getAttribute('animation');
                    // }
                }
            }
        }
    }
    catch (e) {
        console.error(e);
    }

    console.log({
        DYNAMIC_CELLS,
        // MAP_ANIMATIONS,
        MAP_CELLS,
        MAP_LEDS,
        MAP_PROGRESS_BAR,
        MAP_SPEEDOMETER,
        MAP_VISIBILITY
    });
}

function handleNotifications(alarm) {
    var uniqueId = new Date().getTime();

    Toastify({
        selector: "notificationContainer",
        text: alarm.message,
        time: toasterTime(alarm.creationTime),
        typeText: alarm.alarmType,
        duration: toasterParams.duration || 5000,
        close: toasterParams.closeBtn,
        autoClose: toasterParams.autoClose,
        gravity: toasterParams.positionVertical || 'bottom',
        positionLeft: (typeof toasterParams.positionHorizontal == 'string') ? toasterParams.positionHorizontal == 'left' : true,
        className: (typeof alarm.alarmType == 'string') ? 'toastify-' + alarm.alarmType : '',
        callback: function() {
        },
        actions: {
            acknowledge: {
                id: alarm.entityId,
                uniqueId: uniqueId,
                name: "Send Ack",
                callback: function() {
                    sendAlarmAcknowledge(alarm.entityId, uniqueId);
                }
            },
            close: {
                id: alarm.entityId,
                uniqueId: uniqueId,
                name: "Close",
                disable: true,
                callback: function(event) {
                    sendAlarmClose(alarm.entityId);
                    event.target.parentElement.parentElement.removeChild(event.target.parentElement);
                    Toastify.reposition();
                }
            },
            forceClose: {
                id: alarm.entityId,
                uniqueId: uniqueId,
                name: "Force Close!",
                callback: function(event) {
                    event.target.parentElement.parentElement.removeChild(event.target.parentElement);
                    Toastify.reposition();
                }
            }
        }
    }).showToast(function(element) {
        notifications.push(element);
    });
}

function sendAlarmAcknowledge(id, uniqueId) {
    var data = {
        type: 10,
        content: JSON.stringify({
            id: id
        })
    };

    sendAsyncMessage(data);
    document.getElementById(id+"-"+uniqueId+"-close").disabled = false;
}

function sendAlarmClose(id) {
    var data = {
        type: 11,
        content: JSON.stringify({
            id: id
        })
    };

    sendAsyncMessage(data);
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

    if(openNotifyMenu) {
        openNotifyMenu.style.left = (document.getElementById(notificationContainer).clientWidth) ? document.getElementById(notificationContainer).clientWidth + 20 : 20;
    }
});

/**
 * Helper Functions
 */

function fakeDataGenerator() {
    setInterval(function () {
        var data = {
            type: 'tag',
            entityId: '16',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '17',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '36',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '37',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '32',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;
        data = {
            type: 'tag',
            entityId: '33',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '34',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '35',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '22',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        data = {
            type: 'tag',
            entityId: '23',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '10',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '20',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '21',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '11',
            value: Math.floor(Math.random() * 30),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '12',
            value: Math.random() * 2,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '13',
            value: Math.random() * 2,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '24',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '25',
            value: Math.floor(Math.random() * 2),
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '14',
            value: Math.random() * 50,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;

        var data = {
            type: 'tag',
            entityId: '15',
            value: Math.random() * 50,
            creationTime: Date.now()
        };

        asyncData[data.entityId] = data;
    }, 100);

    var data = {
        type: 'alarm',
        entityId: Math.floor(Math.random() * 10),
        value: Math.random() * 50,
        message: "This one is kinda long so it should take more space. This is a random message at " + new Date().toLocaleDateString() + " - " + new Date().toLocaleTimeString(),
        creationTime: Date.now(),
        alarmType: 'danger'
    };
    handleNotifications(data);

    setInterval(() => {
        var types = ['danger', 'warning', 'info', ''];

        var data = {
            type: 'alarm',
            entityId: Math.floor(Math.random() * 10),
            value: Math.random() * 50,
            message: "This is a random message at " + new Date().toLocaleDateString() + " - " + new Date().toLocaleTimeString(),
            creationTime: Date.now(),
            alarmType: types[Math.floor(Math.random()*4)]
        };
        handleNotifications(data);
    }, 5000);
}

function bytesToString(arr) {
    var str = '';

    for (var i = 0; i < arr.length; i++) {
        str += String.fromCharCode(arr[i]);
    }

    return str;
};

function monthName(month, short) {
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    if(short) {
        return months[month].substring(0, 3);
    } else {
        return months[month];
    }
}

function toasterTime(timestamp) {
    return new Date(timestamp).getDate() + ' ' +
        monthName(new Date(timestamp).getMonth()) + ' ' +
        new Date(timestamp).getFullYear() + ' at ' +
        new Date(timestamp).toLocaleTimeString()
}
