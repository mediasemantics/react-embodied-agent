export default MSAgentModule

function MSAgentModule(divid, userid, moduleid, params) {
    var that = this;
    if (!params) params = {};
    var serverBase = params.standalone ? null : "https://api.mediasemantics.com/";
    var mediaBase = params.standalone ? null : "https://media.mediasemantics.com/";
    var data;                   // Initial load
    var version;
    var hash;
    var scenePreviewMode;       // For authoring
    var messagePreviewMode;
    var eventPreviewMode;
    var fade = true;            // Whether we fade-in the opening scene - true by default but can be overridden in params
    var playQueue = [];         // Queue of [0,id,line] or [1,{do,say,audio,...}]
    var playCur = null;         // Currently playing playQueue item, or null
    var highlight = "";         // During authoring, allows a region to be highlighted
    var idleType = "normal";
    var enduserid;
    var startupPaused = false;
    var variables = {};         // Variables    
    var storing;
    var storePending;
    var nav;                    // True if this is not the first module creation in the session, i.e. we have navigated from one page with the module to another page with the same module
    var elapsedSinceLastVisit;
    var token;
    var apogee;                 // Used to detect if an apogee was reached on a line
    var appearedAlready;        // Suppresses greeting on second show/fadeIn
    var xhr1 = null;
    var xhr2 = null;

    function resetOuterVars() {
        fade = true;
        playQueue = [];
        playCur = null;
        highlight = "";
        idleType = "normal";
        enduserid = "";
        variables = {};
        storing = false;
        storePending = false;
        nav = false;
        appearedAlready = false;
        if (xhr1) xhr1.abort();
        xhr1 = null;
        if (xhr2) xhr2.abort();
        xhr2 = null;
    }

    if (params.videoData)
        setTimeout(doVideo, 0);
    else
        loadData();

    function loadData() {
        token = params.token;
        xhr1 = new XMLHttpRequest();
        xhr1.onload = function() {
            data = null;
            try {
                var o = JSON.parse(xhr1.response);
                xhr1 = null;
                if (serverBase) {
                    if (!o.success) {
                        console.log("People Builder service error: " + o.message);
                        return;
                    }
                    data = o.data;
                    version = o.data.version;
                }
                else {
                    data = o;
                    version = data.version;
                }
            } catch (e) {
                xhr1 = null;
                console.log("People Builder " + (serverBase ? "service error" : "missing cb/" + moduleid + "/data.json"));
            }
            if (data) onDataLoaded();
        };
        xhr1.onerror = function() {
            console.log("People Builder " + (serverBase ? "service error" : "missing cb/" + moduleid + "/data.json"));
            xhr1 = null;
        }
        xhr1.open("GET", serverBase ? serverBase + "cb/getmoduledata?userid=" + userid + "&moduleid=" + moduleid + (params.version == "edit" ? "&version=edit" : "") + (token ? "&token=" + token : "") : 
                                     "cb/" + moduleid + "/data.json", true);
        xhr1.send();
    }

    function onDataLoaded() {
        setupIdentity();
        loadHash();
    }

    function setupIdentity() {
        // enduserid
        if (params.enduserid) {
            enduserid = params.enduserid; // in a situation where the end user always logs on with an id of some sort prior to use, then we will use this id for logging, long-term memories, etc.
            if (enduserid == "Preview") sessionStorage.clear(); // authoring convenience
        }
        else { 
            // allow module identity setting to be overridden by a parameter, e.g. {identity="session"}
            if (params.identity)
                data.identity = params.identity;
            if (data.identity||"session" == "session")
                deleteCookie("enduserid");
            // try and read one from our cookie
            if (data.identity == "device")
                enduserid = getCookie("enduserid");
            // navigation between pages case
            if (sessionStorage[moduleid + "-enduserid"]) {
                enduserid = sessionStorage[moduleid + "-enduserid"];
                nav = true;
            }
            // otherwise we generate our own using the timestamp and some random digits
            if (!enduserid) {
                enduserid = (new Date()).getTime().toString();
                for (var i = 0; i <= 3; i++)
                    enduserid += Math.floor(Math.random()*10);
            }
            // persistent cookie, if allowed
            if (data.identity == "device")
                setCookie("enduserid", enduserid, 365);
            // session storage regardless - lets us detect nav case
            sessionStorage.setItem(moduleid + "-enduserid", enduserid);
        }
    }

    // e.g. if user says no cookies then you could do overrideIdentity("session")
    this.overrideIdentity = function(value) {
        setupIdentity({enduserid:params.enduserid, identity:value});
    }    
    
    function loadHash() {
        xhr2 = new XMLHttpRequest();
        xhr2.onload = function() {
            hash = null;
            try {
                var o = JSON.parse(xhr2.response);
                xhr2 = null;
                if (serverBase) {
                    if (!o.success) throw error();
                    hash = o.hash;
                }
                else {
                    hash = o;
                }
            } catch (e) {
                xhr2 = null;
                console.log("People Builder " + (serverBase ? "service error" : "missing cb/" + moduleid + "/hash.json"));
            }
            if (hash) onHashLoaded();
        };
        xhr2.open("GET", serverBase ? serverBase + "cb/getmodulehash?userid=" + userid + "&moduleid=" + moduleid : 
                                     "cb/" + moduleid + "/hash.json", true);
        xhr2.send();
    }

    function onHashLoaded() {
        if (preloadOnly) return document.getElementById(divid).dispatchEvent(createEvent("moduleLoaded"));
        loadVariables(function() {
            loadBackgroundResources(function() {
                onResourcesLoaded();
            });
        });
    }
    
    function onResourcesLoaded() {
        // when running in view tab
        if (params.version == "edit") {
            version = "edit";
        }

        if (params.messagePreview)
            messagePreviewMode = true;
        if (params.eventPreview)
            eventPreviewMode = true;
        if (params.scenePreview)
            scenePreviewMode = true;
            
        // these parameters should maybe be exposed as options in People Builder, but the defaults are normally okay
        if (typeof params.preload === "boolean") preload = params.preload;
        if (typeof params.fade === "boolean") fade = params.fade;
        if (typeof params.idleType === "string") idleType = params.idleType; // "none"/"blink"/"normal"
        if (typeof params.preloadOnly === "boolean") preloadOnly = params.preloadOnly; // for internal use
        
        // Protect ourselves against some degenerate cases
        if (!data.messages)
            data.messages = [];

        setupScene();
        
        if (data.scene.playShield || scenePreviewMode) {
            setupPlayShield(data.width, data.height);
            showPlayShield(false);
            if (data.scene.playShield) { // live
                if (data.scene.playShieldBehavior == "always" || (data.scene.playShieldBehavior||"needed") == "needed" && audioContext && audioContext.state == "suspended")
                    showPlayShield(true);
            }
        }
        
        if (clientScale("only")) setupClientScaleBackground();
        setupCharacter();
        if (scenePreviewMode) updateHighlight();
    }

    function loadBackgroundResources(callback) {
        var image = data.scene.onlyBackgroundImage;
        if (clientScale("only") && data.scene.onlyBackgroundType == 'image' && image) {
            var img = new Image;
            img.onload = img.onerror = callback;
            img.src = urlFromImage(image);
        } else callback();
    }

    function setupScene() {
        var div = document.getElementById(divid);
        if (!div) return;
        var scene = data.scene;
        var cx = data.width;   // scene
        var cy = data.height;
        var cxChar = cx;       // character effective width/height
        var cyChar = cy;
        var cxCharScaled = cx; // character canvas pixel width/height
        var cyCharScaled = cy;
        var xOffset = 0;       // character canvas client offset 
        var yOffset = 0;
        if (clientScale("only")) { // backgroundless, transparent, 0-offset, character-size * density image is scaled at the client and placed on a background loaded directly by the client
            var cxCharNatural = data.scene.onlyCharacterNaturalWidth||750; // hardcoded max disappears as all modules gain CharacterNaturalWidth
            var cyCharNatural = data.scene.onlyCharacterNaturalHeight||600;
            cxChar = cxCharNatural * (scene.onlyCharacterDensity||1) * (isVector("only") ? 2 : 1);
            cyChar = cyCharNatural * (scene.onlyCharacterDensity||1) * (isVector("only") ? 2 : 1);
            cxCharScaled = Math.round(cxCharNatural * (scene.onlyCharacterScale||100) / 100);
            cyCharScaled = Math.round(cyCharNatural * (scene.onlyCharacterScale||100) / 100);
            xOffset = data.scene.onlyCharacterX||0;
            yOffset = data.scene.onlyCharacterY||0;
        }
        var s = '';
        s += '<div id="' + divid + '-top' + '" style="visibility:hidden; width:' + cx + 'px; height:' + cy + 'px; position:relative; overflow: hidden;">';
        if (clientScale("only"))
        s += '  <div id="' + divid + '-background-div" style="position:absolute; top:0px; left:0px; width:' + cx + 'px; height:' + cy + 'px;"></div>'; 
        s += '  <canvas id="' + divid + '-only-canvas" width="' + cxChar + '" height="' + cyChar + '" style="position:absolute; top:' + yOffset + 'px; left:' + xOffset + 'px; width:' + cxCharScaled + 'px; height:' + cyCharScaled + 'px; "></canvas>';
        if (scenePreviewMode)
        s += '  <div id="' + divid + '-highlight-div" style="border: 2px dashed #00ff00; position:absolute"></div>';
        if (data.scene.playShield || scenePreviewMode)
        s += '  <canvas id="' + divid + '-playshield-canvas" style="position:absolute; left:0px; top:0px;" width="' + cx +'px" height="' + cy + 'px"/></canvas>';
        s += '</div>'
        div.innerHTML = s;
    }

    function setupClientScaleBackground() {
        var div = document.getElementById(divid+"-background-div");
        if (!div) return;
        var scene = data.scene;
        var type = scene.onlyBackgroundType||"solid";
        if (type == "solid")
            div.style.background = scene.onlyBackgroundSolid || "solid";
        else if (type == "gradient")
            div.style.background = "linear-gradient(" + (scene.onlyBackgroundGradient1 || "#ffffff") + ", " + (scene.onlyBackgroundGradient2 || "#ffffff") + ")";
        else if (type == "image" || (type == "transparent" && scenePreviewMode)) {
            var backgroundImage = (scene.onlyBackgroundImage || "");
            // Identical code to server side tt.js
            var url;
            if (type == "transparent")
                url = "img/misc/check.png";
            else
                url = urlFromImage(backgroundImage);
            div.style.backgroundImage = url ? 'url("' + url + '")' : '';
            div.style.backgroundRepeat = "no-repeat";
            div.style.overflow = "hidden";
            div.style.backgroundSize = "cover";
            div.style.backgroundPosition = "center";
            if (type == "transparent") {
                div.style.backgroundRepeat = "repeat";
                div.style.backgroundSize = "auto";
                div.style.backgroundPosition = "left top";
            }
        }
    }
    
    function urlFromImage(image) {
        if (image && image.substr(0, 6) == "stock:")
            return (mediaBase ? mediaBase + "stock/image/" : "cb/" + moduleid + "/") + image.replace("stock:", "");
        else if (image && image.substr(0, 5) == "file:")
            return (mediaBase ? mediaBase + userid + "/image/" : "cb/" + moduleid + "/") + image.replace("file:", "");
        else
            return null;
    }

    function liveAdjustCharacterScale(value) {
        // always clientScale here
        var cxCharNatural = data.scene.onlyCharacterNaturalWidth||750; // hardcoded max disappears as all modules gain CharacterNaturalWidth
        var cyCharNatural = data.scene.onlyCharacterNaturalHeight||600;
        var cxCharScaled = Math.round(cxCharNatural * value / 100);
        var cyCharScaled = Math.round(cyCharNatural * value / 100);
        var canvas = document.getElementById(divid + "-" + "only" + "-canvas");
        canvas.style.width = cxCharScaled + 'px';
        canvas.style.height = cyCharScaled + 'px';
    }

    function liveAdjustPlayShield() {
        showPlayShield(data.scene.playShield && highlight == 'misc');
    }

    function showPlayShield(show) {
        var e = document.getElementById(divid + "-playshield-canvas")
        if (e) e.style.display = show ? "block" : "none";
    }

    function messageIndexFromName(name) {
        for (var i = 0; i < data.messages.length; i++) {
            if (data.messages[i].name == name)
                return i;
        }
        return -1;
    }

    function messageIndexFromId(id) {
        for (var i = 0; i < data.messages.length; i++) {
            if (data.messages[i].id == id)
                return i;
        }
        return -1;
    }

    function eventIndexFromId(id) {
        for (var i = 0; i < (data.events||[]).length; i++) {
            if (data.events[i].id == id)
                return i;
        }
        return -1;
    }

    function setupCharacter() {
        execute('only', scenePreviewMode ? "&preview=true" : "", null, null, null, null); // first load results in characterLoaded
    }

    // TODO - spinner.

    function characterLoaded() {
        // NOTE: dispatched just before we become visible
        document.getElementById(divid).dispatchEvent(createEvent("moduleLoaded"));
        if (startupPaused) return;
        fadeInScene();
    }
    
    this.pauseStartup = function(value) {
        startupPaused = true;
    }

    this.resumeStartup = function(value) {
        fadeInScene();
    }
    
    function fadeInScene() {
        var topDiv = document.getElementById(divid + "-top");
		if (!topDiv) return;
        if (params.visible !== false) {
            topDiv.style.visibility = "visible";
            if (fade)
                fadeIn(topDiv, 400, sceneFullyFadedIn);
            else
                sceneFullyFadedIn();
        }
    }

    function sceneFullyFadedIn() {
        if (scenePreviewMode) return;
        startIdle();

        if (appearedAlready) return;
        appearedAlready = true;
        var autoplay = data.autoplay;
        if (data.scene.playShield && (data.scene.playShieldBehavior == "always" || (data.scene.playShieldBehavior||"needed") == "needed" && audioContext && audioContext.state == "suspended")) // unless there will be a playshield
            autoplay = false;
        if (autoplay && !scenePreviewMode && !messagePreviewMode && !eventPreviewMode) {
            playGreeting();
        }
    }

    function playGreeting() {
        // greeting - first time or return - acts to extend the beginning of the slide presentation
        var event;
        if (nav) {
            event = "nav";
        }
        else {
            if (variables["LastVisit"]) { // can only happen if there is storage
                elapsedSinceLastVisit = (new Date()).getTime() - new Date(variables["LastVisit"]).getTime();
                event = "return";
            }
            else {
                event = "new";
            }
            setVariable("LastVisit", new Date().toISOString());
        }
        if (event) return reactToEvent(event);
    }

    function onPlayShieldClick() {
        var e = document.getElementById(divid + "-playshield-canvas")
        if (e) e.style.display = "none";
        playGreeting();
    }

    function reactToEvent(eventType) {
        var obj;
        var moduleEvents = data.events||[];
        for (var i = 0; i < moduleEvents.length; i++) {
            if (moduleEvents[i].event == eventType) {
                obj = moduleEvents[i];
                break;
            }
        }
        if (!obj) return false;
        playEvent(obj);
        return true;
    }
    
    function hasLine(node, base, n) {
        if (node[base] && n >= 1 && n < node[base].length) return true;
        if (node[base] && n >= 1 && n <= node[base].length) return !!node[base][n-1].do || !!node[base][n-1].and || !!node[base][n-1].say || !!node[base][n-1].audio;
        else return false;
    }

    function getLine(node, base, n) {
        if (node[base] && n >= 1 && n <= node[base].length) return node[base][n-1];
        else return {};
    }

    this.visible = function() {
        var topDiv = document.getElementById(divid + "-top");
        return topDiv && topDiv.style.visibility == "visible";
    };

    this.hide = function() {
        stopIdle();
        var topDiv = document.getElementById(divid + "-top");
        if (topDiv) topDiv.style.visibility = "hidden";
    };

    this.show = function() {
        var topDiv = document.getElementById(divid + "-top");
        if (topDiv) topDiv.style.visibility = "visible";
        startIdle();
    };

    this.fadeIn = function() {
        fadeInChar();
    };

    this.fadeOut = function() {
        stopIdle();
        fadeOutChar();
    };
    
    this.playing = function() {
        return !!playCur; // could be a play, dynamicPlay, or an event
    };

    this.play = function(message) {
        if (audioContext) audioContext.resume();
        var i = 0;
        if (message) i = messageIndexFromId(message);    // works both by index and by name, but API users generally use by name
        if (i == -1) i = messageIndexFromName(message);
        var played = false;
        if (i != -1) {
            var message = data.messages[i];
            var line = 1;
            while (hasLine(message, "script", line)) {
                var o = getLine(message, "script", line);
                if (!loading['only'] && !animating['only']) {  // multiline messages get treated much like multiple back-to-back messages
                    playCur = [0, message.id, line];
                    execute('only', '&msg=' + message.id + "&line=" + line, o.do, o.say, o.audio, onPlayDone);
                }
                else {
                    if (!playCur && playQueue.length == 0) 
                        stopAll(); // accelerate any running idle when we begin to play
                    playQueue.push([0, message.id, line]);
                    // All queued messages are preload candidates
                    preloadExecute('only', '&msg=' + message.id + "&line=" + line, o.do, o.say, o.audio);
                }
                line++;
                played = true;
            }
        }
        else console.log("People Builder play() unknown message '" + message + "'.");
        if (!played) document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // always get one of these
    }

    this.preloadPlay = function(message) {
        var i = 0;
        if (message) i = messageIndexFromId(message);
        if (i == -1) i = messageIndexFromName(message);
        if (i != -1) {
            var message = data.messages[i];
            var line = 1;
            while (hasLine(message, "script", line)) {
                var o = getLine(message, "script", line);
                preloadExecute('only', '&msg=' + message.id + "&line=" + line, o.do, o.say, o.audio);
                line++;
            }
        }
    }

    this.dynamicPlay = function(o) {
        if (audioContext) audioContext.resume();
        if (o) {
            if (typeof o.say == "number") o.say = o.say.toString();
            else if (typeof o.say != "string") o.say = "";
            o.say = o.say.substr(0, 256);
            if (!loading['only'] && !animating['only'] && !stopping['only']) {  // multiline messages get treated much like multiple back-to-back messages
                playCur = [1, o];
                execute('only', '&dynamic=true', o.do, o.say, o.audio, onPlayDone);
            }
            else {
                playQueue.push([1, o]);
                // All queued messages are preload candidates
                preloadExecute('only', '&dynamic=true', o.do, o.say, o.audio);
            }
        }
        else document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // always get one of these, i.e. if you actively play a message which is not there it should act like a blank message
    }
    
    // Like dynamicPlay, but merely attempts to preload all the files required
    this.preloadDynamicPlay = function(o) {
        if (o) {
            if (typeof o.say == "number") o.say = o.say.toString();
            else if (typeof o.say != "string") o.say = "";
            o.say = o.say.substr(0, 256);
            preloadExecute('only', '&dynamic=true', o.do, o.say, o.audio, o.lipsync);
        }
    }
    
    this.preloading = function(o) {
        return preload && preloadQueue.length > 0;
    }

    this.setIdleType = function(t) {
        idleType = t;
    };

    this.transcriptFromText = function(s) {
        return transcriptFromText(s);
    };

    this.scriptFromText = function(s) {
        return scriptFromText(s);
    };

    this.sentenceSplit = function(s) {
        return sentenceSplit(s);
    };
    
    this.playEvent = function(eventId) { // for internal use
        for (var i = 0; i < (data.events||[]).length; i++) {
            if (data.events[i].id == eventId)
                playEvent(data.events[i]);
        }
    }
    
    function playEvent(eventObj) {
        if (audioContext) audioContext.resume();
        var line = 1;
        while (hasLine(eventObj, "handler", line)) {
            var o = getLine(eventObj, "handler", line);
            if (!loading['only'] && !animating['only']) {  // multiline messages get treated much like multiple back-to-back messages
                playCur = [2, eventObj.id, line];
                execute('only', '&event=' + eventObj.id + "&line=" + line, o.do, o.say, o.audio, onPlayDone);
            }
            else {
                if (!playCur && playQueue.length == 0) 
                    stopAll(); // accelerate any running idle when we begin to play
                playQueue.push([2, eventObj.id, line]);
                preloadExecute('only', '&event=' + eventObj.id + '&line=' + line, o.do, o.say, o.audio);
            }
            line++;
        }
    }
    
    this.prepareToPreload = function() { // for internal use
        // who params tag say file
        preloadExecute("only", "", null, null, null);
        preloadExecute("only", "&idle=blink", "blink", null, null);
        var idles = getIdles("only");
        for (var i = 0; i < idles.length; i++)
            preloadExecute("only", "&idle=" + idles[i], idles[i], null, null);
        for (var i = 0; i < data.messages.length; i++) {
            var message = data.messages[i];
            var line = 1;
            while (hasLine(message, "script", line)) {
                var o = getLine(message, "script", line);
                preloadExecute("only", '&msg=' + message.id + "&line=" + line, o.do, o.say, o.audio);
                line++;
            }
        }
        return preloadQueue.length; // return approximate number of items to preload - actual number may be higher due to secondary textures
    }
    
    this.preloadNext = function(callback) { // for internal use
        if (preloadQueue.length == 0) return callback(0);
        preloadNextCallback = callback;
        preloadSomeMore();
    }
    
    function onIdleComplete() {
        // if a play happens while running an idle automation, we just queue it up
        onPlayDone();
    }

    function onPlayDone() {
        if (playCur && !apogee) onEmbeddedCommand({type:'apogee'});
        if (playQueue.length > 0) {
            playCur = playQueue.shift();
            if (playCur[0] == 0) {
                var msg = playCur[1];
                var line = playCur[2];
                var message = data.messages[messageIndexFromId(msg)];
                var o = getLine(message, "script", line);
                execute('only', '&msg=' + msg + "&line=" + line, o.do, o.say, o.audio, onPlayDone);
            }
            else if (playCur[0] == 1) {
                execute('only', '&dynamic=true', playCur[1].do, playCur[1].say, playCur[1].audio, onPlayDone);
            }
            else if (playCur[0] == 2) {
                var id = playCur[1];
                var line = playCur[2];
                var event = data.events[eventIndexFromId(id)];
                var o = getLine(event, "handler", line);
                execute('only', '&event=' + event.id + '&line=' + line, o.do, o.say, o.audio, onPlayDone);
            }
        }
        else {
            if (playCur) { // we also get here onIdleComplete
                playCur = null;
                document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // i.e. all plays complete - we are idle
            }
        }
    }

    this.stop = function() {
        stopAll();
        playQueue = [];
    }

    this.volume = function() {
        return externalGainNode.gain.value;
    }
    this.getVolume = this.volume; // deprecated

    this.setVolume = function(value) {
        externalGainNode.gain.value = value;
    }

    //
    // Preview live-adjustment
    //

    this.highlightRegion = function(target) {
        // can come before the scene is live
        highlight = target;
        updateHighlight();
    }

    function updateHighlight() {
        var highlightDiv = document.getElementById(divid + "-highlight-div");
        if (!highlightDiv) return;
        var div;
        if (highlight == "background" || highlight == "character" || highlight == "misc")
            div = document.getElementById(divid+'-background-div');
        if (div) {
            highlightDiv.style.top = div.style.top;
            highlightDiv.style.left = div.style.left;
            highlightDiv.style.width = div.clientWidth+"px";
            highlightDiv.style.height = div.clientHeight+"px";
            var topDiv = document.getElementById(divid + "-top");
            highlightDiv.style.visibility = (div.clientWidth == 0 || div.clientHeight == 0) ? "hidden" : "inherit";
            // for drag offset in frame
            if (highlight == "character") {
                highlightDiv.style.cursor = "move";
                var canvasDiv = document.getElementById(divid + "-only-canvas");
                highlightDiv.ondragstart = function() {return false;}
                highlightDiv.onmousedown = function(e) {
                    var xdown = e.pageX;
                    var ydown = e.pageY;
                    var leftdown = parseInt(canvasDiv.style.left); 
                    var topdown = parseInt(canvasDiv.style.top);
                    function onMouseMove(e) {
                        canvasDiv.style.left = leftdown + (e.pageX - xdown) + 'px';
                        canvasDiv.style.top = topdown + (e.pageY - ydown) + 'px';
                        if (highlight) document.getElementById(divid).dispatchEvent(createEvent("drag", {target:highlight, done:false, x:parseInt(canvasDiv.style.left), y:parseInt(canvasDiv.style.top)}));
                    }
                    function onMouseUp(e) {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        /*if (container) {
                            container[propbase + (slide ? 'Left' : 'X')] = parseInt(div.style.left); 
                            container[propbase + (slide ? 'Top' : 'Y')] = parseInt(div.style.top);
                        }*/
                        document.getElementById(divid).dispatchEvent(createEvent("drag", {target:highlight, done:true, x:parseInt(canvasDiv.style.left), y:parseInt(canvasDiv.style.top)}));
                    }
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }
            }
            else {
                highlightDiv.style.cursor = "auto";
                highlightDiv.ondragstart = null;
                highlightDiv.onmousedown = null;
            }            
        }
        else highlightDiv.style.visibility = "hidden";
        liveAdjustPlayShield();
    }

    this.liveAdjust = function(object, property, value) {
        var scene = data.scene;
        if (object == "character") {
            var obj = document.getElementById(divid + '-only-canvas');
            if (property == "x") obj.style.left = value + 'px';
            else if (property == "y") obj.style.top = value + 'px';
            else if (property == "scale") liveAdjustCharacterScale(value);
        }
        else if (object == "background") {
            // Easier to copy the new values back to data and call setupClientScaleBackground
            if (property == "type") scene.onlyBackgroundType = value;
            else if (property == "solid") scene.onlyBackgroundSolid = value;
            else if (property == "gradient1") scene.onlyBackgroundGradient1 = value;
            else if (property == "gradient2") scene.onlyBackgroundGradient2 = value;
            else if (property == "image") scene.onlyBackgroundImage = value;
            setupClientScaleBackground();
        }
        else if (object == "module") {
            if (property == "width") data.width = value;
            else if (property == "height") data.height = value;
            var obj = document.getElementById(divid);
            obj.style.width = data.width + 'px';
            obj.style.height = data.height + 'px';
            var top = document.getElementById(divid + '-top');
            top.style.width = data.width + 'px';
            top.style.height = data.height + 'px';
            var background = document.getElementById(divid + '-background-div');
            background.style.width = data.width + 'px';
            background.style.height = data.height + 'px';
            setupClientScaleBackground();
            updateHighlight();
        }
        else if (object == "message") {
            // When the script changes we live adjust the new message even while we are saving the change off to the server, so we can play it immediately, and without a reload
            var messages = data.messages;
            var index = messageIndexFromId(property);
            messages[index] = JSON.parse(JSON.stringify(value));
        }
        else if (object == "playShield") {
            if (property == "show") {
                data.scene.playShield = value;
                liveAdjustPlayShield();
            }
        }
    }

    function onEmbeddedCommand(cmd) {
        // Occurs in the middle of running the current line for certain tags with an "apogee", e.g. look, point
        var rec;
        if (playCur[0] == 0) {
            var msg = playCur[1];
            var line = playCur[2];
            var message = data.messages[messageIndexFromId(msg)];
            rec = getLine(message, "script", line);
        }
        else if (playCur[0] == 1) {
            rec = playCur[1];
        }
        else if (playCur[0] == 2) {
            var eventId = playCur[1];
            var line = playCur[2];
            var eventObj = data.events[eventIndexFromId(eventId)];
            rec = getLine(eventObj, "handler", line);
        }
        if (cmd.type == 'apogee') {
            apogee = true;
            if (rec.and == "run") 
                eval(rec.script);
            else if (rec.and == "link") 
                window.open(rec.url, rec.target);
            else if (rec.and == "command") 
                document.getElementById(divid).dispatchEvent(createEvent("scriptCommand", rec.value));
        }
        else {
            document.getElementById(divid).dispatchEvent(createEvent("embeddedCommand", cmd)); // e.g. foo [cmd a="test" b="123"] bar
            document.getElementById(divid).dispatchEvent(createEvent("command", cmd)); // legacy event name
        }
    }

    function showTranscript() {
        if (stagedTranscript) {
            document.getElementById(divid).dispatchEvent(createEvent("closedCaption", transcriptFromText(stagedTranscript)));
            stagedTranscript = undefined;
        }
    }

    // Used internally for video render
    function doVideo() {
        // Some globals that would otherwise be skipped
        data = params.videoData;
        scenePreviewMode = true; // force background
        loadBackgroundResources(function () {   
            setupScene();
            updateHighlight();
            var topDiv = document.getElementById(divid + "-top");
            topDiv.style.visibility = "visible";
            setupClientScaleBackground();
            if (window.callPhantom) window.callPhantom({cmd:"snapshot", name:"back"});
            if (window.callPhantom) window.callPhantom({cmd:"end"});        
        });
    }
    
    //
    // Variables
    //
    
    this.getVariables = function() {
        return JSON.parse(JSON.stringify(variables));
    };

    this.setVariables = function(obj) {
        variables = obj;
    };

    function setVariable(name, value) {
        var old = variables[name];
        variables[name] = value;
        if (value !== old) document.getElementById(divid).dispatchEvent(createEvent("variablesChanged"));
        storeVariables();
    }

    function storeVariables() {
        if (data.storage == "builder" && serverBase && !scenePreviewMode) {
            if (storing) storePending = true;
            else {
                storing = true;
                var xhr = new XMLHttpRequest();
                xhr.open("POST", serverBase + "cb/setvariables", true);
                xhr.onload = function () {
                    storing = false;
                    var result = JSON.parse(xhr.response);
                    if (!result.success) return console.log("People Builder service error storing variables: " + result.message);
                    else if (storePending) {
                        storePending = false;
                        storeVariables();
                    }
                };
                xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                var body = "userid=" + userid + "&moduleid=" + moduleid + "&enduserid=" + enduserid;
                for (var name in variables) {
                    body += "&" + encodeURI(name) + "=" + encodeURI(variables[name]); 
                }
                xhr.send(body);
            }
        }
        // Local session store - so at least refreshing the page does not lose data
        if (data.storage != "builder") {
            for (var name in variables) {
                sessionStorage.setItem(moduleid + '-' + name, variables[name]);
            }
        }
    }
    
    function loadVariables(callback) {
        if (data.storage == "builder" && serverBase && !scenePreviewMode) {
            var xhr = new XMLHttpRequest();
            xhr.onload = function() {
                var test = null;
                try {
                    var o = JSON.parse(xhr.response);
                    if (!o.success) throw error();
                    test = o.variables;
                } catch (e) {
                    console.log("People Builder service error getting variables - treating as a first-time user");
                }
                if (test) {
                    that.setVariables(test);
                }
                callback();
            };
            xhr.open("GET", serverBase + "cb/getvariables?userid=" + userid + "&moduleid=" + moduleid + "&enduserid=" + enduserid, true);
            xhr.send();
        }
        else {
            if (data.storage != "builder" && !scenePreviewMode) {
                for (var name in sessionStorage[name]) {
                    if (name.split("-")[0] == moduleid)
                        variables[name.split("-")[1]] = sessionStorage[name];
                }
            }
            callback();
        }
    }

    function getCookie(name) {
        var v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
        return v ? v[2] : null;
    }
    
    function setCookie(name, value, days) {
        var d = new Date;
        d.setTime(d.getTime() + 24*60*60*1000*days);
        document.cookie = name + "=" + value + "; secure; path=/; samesite=none; partitioned; expires=" + d.toGMTString();
    }

    function deleteCookie(name) {
        document.cookie = name+'=; Max-Age=-99999999;'; 
    }
    
    // Set some stuff up for below the line
    var roles = {'only':0}; // for easy "for (who in roles)" looping
    var animateBase = serverBase ? serverBase + "cb/agentAnimate" : null;
    function onChatIdle() {}

    //////////////////////////////////////////////////// THE LINE ///////////////////////////////////////////////////////

    // Audio - only one speaking animation occurs at a time
    var audioContext = AudioContext ? new AudioContext() : null;
    var externalGainNode = null;
    var gainNode = null;
    if (audioContext) {
        externalGainNode = audioContext.createGain();
        externalGainNode.gain.value = 1;
        externalGainNode.connect(audioContext.destination);
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        gainNode.connect(externalGainNode);
    }
    var audioBuffer = {};                // Audio buffer being loaded
    var audioSource = {};                // Audio source, per character

    // Loading
    var texture = {};                    // Latest loaded texture - we try to keep it down to eyes, mouth - the leftovers
    var animData = {};                   // animData to match texture.
    var secondaryTextures = {};          // a set of sets e.g. {only:{LookDownLeft:Texture}}
    var loadPhase = {};                  // 0 = not loaded, 1 = audio/data/texture loaded, 2 = secondary textures loaded
    var defaultTexture = {};             // The initial texture, which needs to load quickly, contains 3 or more textures, so optimize for this.
    var lastExecute = {};                // The animation that we just played (and could play again without reloading)

    // Running
    var fpsInterval, now, then, elapsed; // used in animate
    var loaded = {};                     // True if default frame is loaded for a given character
    var loading = {};                    // True if we are loading a new animation - does not overlap animating
    var idling = {};                     // Qualifies loading/animating - if true then the loading/running animation is an idle animation
    var animating = {};                  // True if a character is animating
    var frame = {};                      // Current frame of animation
    var starting = {};                   // True if we are starting an animation - overlaps animating
    var stopping = {};                   // True if we are stopping an animation - overlaps animating
    var executeCallback = {};            // What to call on execute() return, i.e. when entire animation is complete
    var deferredExecute = {};            // Handle execute during idle - used in slideshow
    var rafid;                           // Defined only when at least one character is animating - otherwise we stop the RAF (game) loop
    var atLeastOneLoadError;             // We use this to stop idle after first load error
    var replying = false;                // True between chat enter and reply received and dynamicPlay issued
    var inFade;                          // True if we are fading in or out char

    // Idle
    var idleTimeout;
    var timeSinceLastIdleCheck;
    var timeSinceLastAction = {};       // Time since any action, reset on end of a message - drives idle priority
    var timeSinceLastBlink = {};        // Similar but only for blink
    var lastIdle = "";                  // Avoid repeating an idle, etc.
    var idleCache = {};                 // Even though idle resources are typically in browser cache, we prefer to keep them in memory, as they are needed repeatedly
    var idleCount = {};                 // The idle count, for each character - drive idle chat and long-term chat phase changes
    
    // Settle feature
    var timeSinceLastAudioStopped = 0;   // Used to detect if and how much we should settle for
    var settleTimeout = {};              // If non-0, we are animating true but are delaying slightly at the beginning to prevent back-to-back audio
	var delayTimeout = {};             	 // If non-0, we are animating true but are delaying audio slightly for leadingSilence

    // Preloading
    var preload = true;         // Master switch (a param normally)
    var preloaded = [];         // list of things we already pulled on
    var preloadQueue = [];      // de-duped list of urls to pull on
    var preloading = null;     // url being preloaded
    var preloadTimeout = null;  // defined if a preload timeout is outstanding
    var preloadOnly = false;    // special internal preloadOnly
    var preloadNextCallback;    // used for preloadNext()

    // Cloudfront locations
    var cacheBase = serverBase ? "https://cache.mediasemantics.com/" : null;

    // HD characters
    var canvasTransformSrc = {};
    var canvasTransformDst = {};
    var sway = {};              // if swaying, actual sway angle
    var swayTime = {};          // time of last sway frame
    var swayTarget = {};        // target angle in radians
    var swayAccel = {};         // proportion of distance from sway to swayTarget
    var breath = {};            // if breathing, actual (max) shoulder displacement
    var breathTime = {};        // used to compute breath
    var random = {};            // random walk controllers
    var suppressRandom = {};
    
    // Misc
    var stagedTranscript;

    function resetInnerVars() {
        gainNode = null;
        audioBuffer = {};
        audioSource = {};
        
        texture = {};
        animData = {};
        secondaryTextures = {};
        loadPhase = {};
        defaultTexture = {};
        lastExecute = {};
        
        loaded = {};
        loading = {};
        animating = {};
        idling = {};
        frame = {};
        stopping = {};
        executeCallback = {};
        deferredExecute = {};
        rafid = null;
        inFade = false;
        
        idleTimeout = null;
        timeSinceLastIdleCheck = 0;
        timeSinceLastAction = {};
        timeSinceLastBlink = {};
        lastIdle = "";
        
        timeSinceLastAudioStopped = 0;
        settleTimeout = {};
		delayTimeout = {};
        
        preload = true;
        preloaded = [];
        preloadQueue = [];
        preloading = null;
        preloadTimeout = null;

        random = {};
        suppressRandom = {};
        
        stagedTranscript = null;
    }

    function execute(who, params, tag, say, file, callback) {
        // Shortcut out in common case where there is no action or audio, i.e. the author could have placed behavior here but did not.
        if ((params.indexOf("msg=") != -1 || params.indexOf("event=") != -1 || params.indexOf("dynamic=") != -1) && !tag && !say && !file) {
            onEmbeddedCommand({type:'apogee'}); // however this could be a legit Look At User and Next - this handles it with no server involvement
            if (callback) callback();
            return;
        }
        apogee = false;
        if (loading[who] || animating[who]) {
            console.log("People Builder internal error"); // execute called on a character while animating that character
            return;
        }

        if (say) stageTranscript(transcriptFromText(say));

        params = params + '&role=' + who; // note params always starts with &

        executeCallback[who] = callback;

        stopping[who] = false;
        loading[who] = true;
        idling[who] = (params.indexOf("&idle=") > -1);
        animating[who] = false;

        if (random[who] && random[who].length > 0 && !idling[who]) suppressRandom[who] = true; // immediately drive any random controllers to 0 (idles are assumed not to start with an immediate hand action)

        // The hash is ignored by the server - it just makes the url unique - it should include all info used by the server to generate this request
        var paramHash = getParamHash(who, tag, say, file, true);

        // In the case of dynamic plays, where the server does not know this information and we must pass it along
        if (params.indexOf("dynamic=true") != -1) {
            if (tag) params = params + '&do=' + tag;
            if (say) params = params + '&say=' + encodeURIComponent(say);
            if (file) params = params + '&audio=' + encodeURIComponent(file);
        }

        var executeRequest = params + "&hash=" + paramHash;
        if (lastExecute[who] == executeRequest) {
            getItStarted(who, file && file.substr(0, 7) != "broken:" || containsActualSpeech(say));
            return;
        }
        else lastExecute[who] = executeRequest;

        audioBuffer[who] = null;
        animData[who] = null;
        texture[who] = null;
        loadPhase[who] = 0;

        if (file && file.substr(0, 7) != "broken:")
            speakRecorded(who, params, file, paramHash);
        else if (containsActualSpeech(say))
            speakTTS(who, params, paramHash);
        else
            audioBuffer[who] = "na"; // sentinel value exists during loading and indicates animation without audio
        // load audio, data, and texture in parallel
        loadAnimation(who, params, paramHash);
    }

	function containsActualSpeech(say) {
        if (!say) return false;
        var textOnly = say.replace(/\[[^\]]*\]/g, ""); // e.g. "Look [cmd] here." --> "Look here."
        if (!textOnly) return false;
        var hasNonWhitespace = !!textOnly.match(/\S/);
        return hasNonWhitespace;
    }
	
    function stageTranscript(text) {
        stagedTranscript = text;
    }

    function transcriptFromText(s) {
        // Filter out tags - adjust for extra space, remove [spoken]...[/spoken] leave [written]...[/written] contents.
        if (typeof(s) == "string") {
            s = s.replace(/\[written\](.*?)\[\/written\]/g, "$1");
            s = s.replace(/\[spoken\].*?\[\/spoken\]/g, "");
            s = s.replace(/\[[^\[]*\]/g, function(x) {return ""});
            s = s.trim().replace(/  /g, " ");
        }
        return s;
    }
    
    // In some cases it is useful to use a tagged-text equivalent from of high level commands.
    // {do:"look-right", say:"Look over here."} <=> "[look-right] Look over here."

    function scriptFromText(s) {
        var aString = sentenceSplit(s);
        var aLine = aString.map(function(s) {
            var o = {};
            // peel off opening tag, if any
            if (s.substr(0,1) === '[') {
                var p = s.indexOf(']');
                if (p === -1) throw new Error("parse malformed tag");
                var tag = s.substr(1, p-1);
                s = s.substr(p+1);
                if (s.substr(0,1) === ' ') s = s.substr(1);
                p = tag.indexOf(" and ");
                if (p !== -1) {
                    o.do = tag.substr(0, p);
                    var and = tag.substr(p+5, tag.length-(p+5));
                    p = and.indexOf(" ");
                    if (p !== -1) {
                        o.and = and.substr(0, p);
                        var rest = and.substr(p+1).trim();
                        if (o.and == "link") {
                            var m = rest.match(/^"([^"]*)"[ ]+"([^"]*)"$/);
                            o.url = m ? m[1] : '';
                            o.target = m ? m[2] : '';
                        }
                        else if (o.and == "command") {
                            var m = rest.match(/^"([^"]*)"$/);
                            o.value = m ? m[1] : '';
                        }
                    }
                    else {
                        o.and = and;
                    }
                }
                else {
                    o.do = tag;
                }
            }
            if (o.do == "look-at-user") o.do = "";
            // peel off closing tag, if any
            if (s.substr(-1) === ']') {
                // TODO
            }
            // any remainder is the say - may include tts tags, but those are sent as-is to the server
            if (s) o.say = s;
            return o;
        });
        return aLine;
    }
    
    function sentenceSplit(s) {
        // eslint-disable-next-line
        var a = (s + " ").replace(/([\.!\?]+[ ]+)/g, "$1\n").split("\n"); // add space, then add a \n after ". ", "?!  ", for example
        // then split on \n - this trick lets us keep that punctuation
        // finish by trimming each piece and remove the empty ones
        var b = [];
        for (var i = 0; i < a.length; i++) {
            var t = a[i].trim();
            if (t.length > 0) b.push(t);
        }
        return b;
    }      

    function getParamHash(who, tag, say, file, includeVoice) {
        // The hash is ignored by the server - it just makes the url unique - it should include all info used by the server to generate this request
        var scene = data.scene;
        var s = data.externality||"1";
        s += scene[who + "Character"];
        s += scene[who + "CharacterVersion"];
        if (includeVoice) s += scene[who + "Voice"];
        if (!clientScale(who)) {
            s += data.width;
            s += data.height;
            s += scene[who + "CharacterX"] || 0;
            s += scene[who + "CharacterY"] || 0;
            s += scene[who + "CharacterScale"] || 100;
        }
        s += scene[who + "CharacterDensity"] || 1;
        s += (tag ? tag : "") + (say ? say : "") + (file ? file : "");
        s += scene[who + "BackgroundType"]||"";
        s += scene[who + "BackgroundSolid"]||"";
        s += scene[who + "BackgroundGradient1"]||"";
        s += scene[who + "BackgroundGradient2"]||"";
        s += scene[who + "BackgroundImage"]||"";
        return simpleHash(s); // MD5 is 100 LOC - don't need crypto-level quality here
    }

    function speakRecorded(who, params, file, paramHash) {
        var audioURL;
        if (file.substr(0, 6) == "stock:")
            audioURL = (mediaBase ? mediaBase + "stock/audio/" : "cb/" + moduleid + "/") + file.replace("stock:", "");
        else if (file.substr(0, 5) == "file:")
            audioURL = (mediaBase ? mediaBase + userid + "/audio/" : "cb/" + moduleid + "/") + file.replace("file:", "");
        if (audioContext) { // Normal case
            var xhr = new XMLHttpRequest();
            xhr.open('GET', audioURL, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                audioContext.decodeAudioData(xhr.response, function (buffer) {
                    audioBuffer[who] = buffer;
                    testAudioDataImageLoaded(who, params, paramHash);
                }, function (e) {
                    animateFailed(who);
                });
            };
            xhr.onerror = function() {animateFailed(who);}
            xhr.send();
        }

        if (audioURL && preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
    }

    function speakTTS(who, params, paramHash) {
        // Get url from s3 cache or animate
        var key = "version=" + version + params + "&hash=" + paramHash;
        var fileHit = hash[key];
        if (!fileHit && version == "edit") fileHit = hash[key.replace("version=edit", "version="+(data.version-1))];
        var audioURL;
        if (fileHit)
            audioURL = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit.split(".")[0] + ".mp3";
        else if (animateBase)
            audioURL = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash + "&type=audio" + (token ? "&token=" + token : "");
        else 
            return console.log("People Builder standalone error");

        // Load the audio
        if (audioContext) { // Normal case - only IE does not support web audio, and is no-longer supported
            var xhr = new XMLHttpRequest();
            xhr.open('GET', audioURL, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                audioContext.decodeAudioData(xhr.response, function (buffer) {
                    audioBuffer[who] = buffer;
                    testAudioDataImageLoaded(who, params, paramHash);
                }, function (e) {
                    animateFailed(who);
                });
            };
            xhr.onerror = function() {animateFailed(who);}
            xhr.send();
        }

        // No need to preload this
        if (audioURL && preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
    }

    function loadAnimation(who, params, paramHash) {
        var key = "version=" + version + params + "&hash=" + paramHash;
        
        // Idle cache shortcut
        if (idleCache[key+'&type=data'] && idleCache[key+'&type=image']) {
            animData[who] = idleCache[key+'&type=data'];
            texture[who] = idleCache[key+'&type=image'];
            testAudioDataImageLoaded(who, params, paramHash);
            return;
        }
        
        // Get urls from s3 cache or animate
        var imageURL;
        var dataURL;
        var fileHit = hash[key];
        if (!fileHit && version == "edit") fileHit = hash[key.replace("version=edit", "version="+(data.version-1))];
        if (fileHit) {
            imageURL = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit;
            dataURL = imageURL.replace(".png",".json").replace(".jpeg",".json");
        }
        else if (animateBase) {
            var t = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash;
            imageURL = t + "&type=image" + (token ? "&token=" + token : "");
            dataURL = t + "&type=data" + (token ? "&token=" + token : "");
        }
        else {
            return console.log("People Builder standalone error");
        }
        
        // Load the data
        var xhr = new XMLHttpRequest();
        xhr.open("GET", dataURL, true);
        xhr.onload = function() {
            try {
                animData[who] = JSON.parse(xhr.response);
                testAudioDataImageLoaded(who, params, paramHash);
            } catch(e) {animateFailed(who);}
        };
        xhr.onerror = function() {animateFailed(who);}
        xhr.send();
        
        // Load the image
        texture[who] = new Image();
        texture[who].onload = function() {
            testAudioDataImageLoaded(who, params, paramHash);
        };
        texture[who].onerror = function() {animateFailed(who);}
        texture[who].crossOrigin = "Anonymous";
        texture[who].src = imageURL;
        
        // No need to preload these
        if (imageURL && preloaded.indexOf(imageURL) == -1) preloaded.push(imageURL);
        if (dataURL && preloaded.indexOf(dataURL) == -1) preloaded.push(dataURL);
    }

    function testAudioDataImageLoaded(who, params, paramHash) {
        if (loadPhase[who] == 0 && audioBuffer[who] && animData[who] && texture[who] && texture[who].complete) audioDataImageLoaded(who, params, paramHash);
    }
    
    function audioDataImageLoaded(who, params, paramHash) {
        loadPhase[who] = 1;
        // Populate idle cache
        if (params.indexOf("&idle=") != -1) {
            var key = "version=" + version + params + "&hash=" + paramHash;
            idleCache[key+'&type=data'] = animData[who];
            idleCache[key+'&type=image'] = texture[who];
        }

        recordSecondaryTextures(who);
        loadSecondaryTextures(who, params);
        testSecondaryTexturesLoaded(who); // covers case of no secondary textures
    }

    function recordSecondaryTextures(who) {
        secondaryTextures[who] = {};
        if (!animData[who]) return;
        for (var i = 0; i < animData[who].textures.length; i++) {
            if (animData[who].textures[i] != "default")
                secondaryTextures[who][animData[who].textures[i]] = null;
        }
    }
    
    function loadSecondaryTextures(who, originalParams) {
        for (var key in secondaryTextures[who]) {
            // key is next texture to load
            var imageURL;
            var params = "&texture=" + key + "&role=" + who;
            
            // idle cache shortcut
            if (idleCache[params+'&type=image']) {
                secondaryTextures[who][key] = idleCache[params+'&type=image'];
            }
            else {
                var paramHash = getParamHash(who, null, null, null, false);
                var fileHit = hash["version=" + version + params + "&hash=" + paramHash];
                if (fileHit)
                    imageURL = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit;
                else if (animateBase)
                    imageURL = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash + "&type=image" + (token ? "&token=" + token : "");
                else 
                    return console.log("People Builder standalone error");
                secondaryTextures[who][key] = new Image();
                secondaryTextures[who][key].crossOrigin = "Anonymous";
                secondaryTextures[who][key].onload = function() {
                    if (!secondaryTextures[who]) return; // e.g. reset
                    
                    // populate idle cache
                    if (originalParams.indexOf("&idle=") != -1 || isReusableTexture(key))
                        idleCache[params+'&type=image'] = secondaryTextures[who][key];
                    
                    testSecondaryTexturesLoaded(who);
                };
                secondaryTextures[who][key].onerror = function() {animateFailed(who);}
                secondaryTextures[who][key].src = imageURL;
                if (imageURL && preloaded.indexOf(imageURL) == -1) preloaded.push(imageURL);
            }
        }
    }

    function testSecondaryTexturesLoaded(who) {
        if (loadPhase[who] != 1) return;
        var allLoaded = true;
        for (var key in secondaryTextures[who])
            if (!secondaryTextures[who][key].complete) {allLoaded = false; break;}
        if (allLoaded) {
            if (audioBuffer[who] == "na") // end use as sentinel
                audioBuffer[who] = null;
            loadPhase[who] = 2;
            getItStarted(who, !!audioBuffer[who])
        }
    }

    function isReusableTexture(s) {
        // A somewhat unclean optimization - this expression tries to capture highly reusable textures used in speaking
        return s.match(/RandomRight|Jaw|Talk|Mouth|Eyes|Head\d+/);
    }

    // just fire and forget at any time, as if you were running execute
    function preloadExecute(who, params, tag, say, file) {
        var paramHash = getParamHash(who, tag, say, file, true);
        params = params + '&role=' + who;
        if (params.indexOf("dynamic=true") != -1) {
            if (tag) params = params + '&do=' + tag;
            if (say) params = params + '&say=' + encodeURIComponent(say);
            if (file) params = params + '&audio=' + encodeURIComponent(file);
        }
        var key = "version=" + version + params + "&hash=" + paramHash;
        var fileHit = hash[key];
        if (!fileHit && version == "edit") fileHit = hash[key.replace("version=edit", "version="+(data.version-1))];
        if (params.indexOf("msg=") != -1 && !tag && !say && !file) return;

        var audioURL;
        if (file && file.substr(0, 7) != "broken:") {
            if (file.substr(0, 6) == "stock:")
                audioURL = (mediaBase ? mediaBase + "stock/audio/" : "cb/" + moduleid + "/") + file.replace("stock:", "");
            else if (file.substr(0, 5) == "file:")
                audioURL = (mediaBase ? mediaBase + userid + "/audio/" : "cb/" + moduleid + "/") + file.replace("file:", "");
        }
        else if (say) {
            if (fileHit)
                audioURL = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit.split(".")[0] + ".mp3";
            else if (animateBase)
                audioURL = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash + "&type=audio" + (token ? "&token=" + token : "");
            else 
                return console.log("People Builder standalone error");
        }
        if (audioURL && !preloadOnly) preloadHelper(audioURL);

        var imageURL;
        var dataURL;
        if (fileHit) {
            // Load image file and data from cloudfront
            imageURL = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit;
            dataURL = imageURL.replace(".png",".json").replace(".jpeg",".json");
			dataURL += "?role=" + who;
        }
        else if (animateBase) {
            var t = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash + (preloadOnly ? "&forcehash=true" : "") + (token ? "&token=" + token : "");
            imageURL = t + "&type=image";
            dataURL = t + "&type=data";
        }
        else {
            return console.log("People Builder standalone error");
        }
        if (imageURL) preloadHelper(imageURL);
        if (dataURL) preloadHelper(dataURL);
        // Note under preloadOnly, we a) only load image and data format, b) we add forcehash=true to force the write all the way through to s3
		// Note that we load data so that we can ensure that we have all textures loaded as well - these get added to the queue as we load.
    }

    function preloadHelper(url) {
        if (preloaded.indexOf(url) == -1 && preloadQueue.indexOf(url) == -1)
            preloadQueue.push(url);
        if (!preloadTimeout && preload)
            preloadTimeout = setTimeout(preloadSomeMore, 100);
    }

    function preloadSomeMore() {
        preloadTimeout = null;
        if (preloading || preloadQueue.length == 0) return;
        preloading = preloadQueue.shift();
        //console.log("preloading "+preloading)
        var xhr = new XMLHttpRequest();
        xhr.open("GET", preloading, true);
        xhr.onload = function() {
            if (preloading) {
                if (preloaded.indexOf(preloading) == -1)
                    preloaded.push(preloading);
                // if this was animation data, then we now can also queue up secondary textures
                if (preloading.indexOf("&type=data") != -1 || preloading.indexOf(".json") != -1) {
                    var animDataPreload;
                    try {
                        animDataPreload = JSON.parse(xhr.response);
                    } catch(e) {animDataPreload = null;}
                    if (animDataPreload) {
                        for (var i = 0; i < animDataPreload.textures.length; i++) {
                            if (animDataPreload.textures[i] != "default") {
                                var who = preloading.match(/role=([a-z]*)/)[1];
                                var params = "&texture=" + animDataPreload.textures[i] + "&role=" + who;            
                                var paramHash = getParamHash(who, null, null, null, false);
                                var fileHit = hash["version=" + version + params + "&hash=" + paramHash];
                                var url;
                                if (fileHit)
                                    url = (cacheBase ? cacheBase + userid : "cb") + "/" + moduleid + "/" + fileHit;
                                else if (animateBase)
                                    url = animateBase + "?userid=" + userid + "&module=" + moduleid + "&version=" + version + params + "&hash=" + paramHash + "&type=image" + (preloadOnly ? "&forcehash=true" : "") + (token ? "&token=" + token : "");
                                else 
                                    return console.log("People Builder standalone error");
                                preloadHelper(url);
                            }
                        }
                    }
                }               
                preloading = null;
            }
            
            if (preloadNextCallback) {
                var t = preloadNextCallback;
                preloadNextCallback = null;
                t(preloadQueue.length); // returns actual number left each time
            }
            else if (preloadQueue.length > 0) {
                preloadTimeout = setTimeout(preloadSomeMore, 100);
            }
            else {
                document.getElementById(divid).dispatchEvent(createEvent("preloadComplete"));
            }
        };
        xhr.onerror = function() {
            // don't complain, but stop preloading
            preloading = null;
        }
        xhr.send();
    }

    function getItStarted(who, startAudio) {
        // render the first frame and start animation loop
        loading[who] = false;
        showTranscript();
		// case where we are stopping before we got started
		if (stopping[who]) {
		    animateComplete(who);
    		return;
		}
        animating[who] = true;
        starting[who] = true;
        
        // Settling feature - establish a minimum time between successive animations - mostly to prevent back to back audio - because we are so good at preloading
        if (settleTimeout[who]) {clearTimeout(settleTimeout[who]); settleTimeout[who] = 0;}
        var t = Date.now();
        if (t - timeSinceLastAudioStopped < 750) {
            settleTimeout[who] = setTimeout(onSettleComplete.bind(null, who, startAudio), 750 - (t - timeSinceLastAudioStopped));
        }
        else {
            getItStartedCheckDelay(who, startAudio);
        }
    }

    function onSettleComplete(who, startAudio) {
        settleTimeout[who] = 0;
        getItStartedCheckDelay(who, startAudio);
    }
    
    function getItStartedCheckDelay(who, startAudio) {
		if (delayTimeout[who]) {clearTimeout(delayTimeout[who]); delayTimeout[who] = 0;}
        if (!animData[who]) return;
        if (animData[who].leadingSilence && startAudio) {
            delayTimeout[who] = setTimeout(onDelayComplete.bind(null, who), animData[who].leadingSilence);
            getItStartedActual(who, false);
        }
        else {
            getItStartedActual(who, startAudio);
        }
    }

    function onDelayComplete(who) {
        delayTimeout[who] = 0;
        getItStartedActual(who, true);
    }
	
    function getItStartedActual(who, startAudio) {
        // start animation loop if needed
        if (!rafid) {
            rafid = requestAnimationFrame(animate);
            fpsInterval = 1000 / animData[who].fps; // note multiple characters assume same frame rate - in practice all our characters are 24fps
            then = Date.now();
	    }        
        // start audio
        if (startAudio) {
            if (audioContext) {
                try {
                    audioSource[who] = audioContext.createBufferSource();
                    audioSource[who].buffer = audioBuffer[who];
                    audioSource[who].connect(gainNode);
                    gainNode.gain.value = 1;
                    audioSource[who].start();
                } catch(e){}
            }
        }
        starting[who] = false;
		// animation impacts sway in a subtle way
		if (Math.random() < 0.5) swayTarget[who] = sway[who];
        if (!preloadTimeout && preload)
            preloadTimeout = setTimeout(preloadSomeMore, 100);
    }

    function isSolidVisible(who) {
        var cur = document.getElementById(divid + "-" + who + "-canvas");
        while (cur) {
            if (cur.style && (cur.style.visibility == "hidden" || !isNaN(cur.style.opacity) && parseInt(cur.style.opacity) < 1))
                return false;
            cur = cur.parentNode;
        }
        return true;
    }
    
    function animate() {
        rafid = null;
		now = Date.now();
        elapsed = now - then;
        if (elapsed <= fpsInterval) {
            rafid = requestAnimationFrame(animate);
            return;
        }
        then = now - (elapsed % fpsInterval);
        var framesSkip = Math.max(1, Math.floor(elapsed / fpsInterval)) - 1;
        //if (framesSkip > 0) console.log("dropped "+framesSkip+" frame(s)");
        
        var completed = {};
        for (var who in roles)
        {
            if (!animData[who])
                continue;
            if (loaded[who] && !isSolidVisible(who)) // no needless draws when invisible or fading
                continue;
            
            if (sway[who] == undefined) sway[who] = 0;
            if (breath[who] == undefined) breath[who] = 0;
            if (breathTime[who] == undefined) breathTime[who] = animData[who].breathCycle ? animData[who].breathCycle/2 + animData[who].breathCycle/2*Math.random() : 0; // prevent sync-breath with multiple characters
            
            var update = false;
            if (!random[who]) initRandomWalk(who, animData[who]);
            var swaying = !!animData[who].swayLength && !scenePreviewMode && params.sway !== false;
            if (swaying && !inFade) {  // For HD character an update can occur because of sway, or actual animation, and often both.
                updateSway(who, 1 + framesSkip);
                if (animData[who].breathCycle && params.breath !== false) updateBreath(who);
                update = true;
            }
            if (animating[who] && !starting[who]) {
                // exit case
                if (frame[who] == -1) {
                    completed[who] = true;
                }
                else {
                    if (frame[who] === undefined) 
                        frame[who] = 0;
                    else { 
                        var frameNew = frame[who] + 1 + framesSkip;
                        while (frame[who] < frameNew) {
                            if (animData[who].frames[frame[who]][1] == -1) break; // regardless, never move past -1 (end of animation) frame
                            if (stopping[who] && animData[who].frames[frame[who]][1]) break; // and when recovering, another recovery frame can occur
                            frame[who]++;
                        }
                    }
                    update = true;
                }
            }
            
            if (!update) continue;
            
			if (!document.getElementById(divid) || document.getElementById(divid).style.visibility == "hidden") continue;

            var canvas = document.getElementById(divid + "-" + who + "-canvas");
            if (!canvas) continue;
            
            var ctx;
            if (!swaying) {
                ctx = canvas.getContext("2d");
            }
            else {  // if we are an HD character, we'll blit to an offscreen canvas instead
                if (!canvasTransformSrc[who+"G"]) {
                    canvasTransformSrc[who+"G"] = document.createElement('canvas');
                    canvasTransformSrc[who+"G"].width = canvas.width;
                    canvasTransformSrc[who+"G"].height = canvas.height + (animData[who].clothingOverhang||0);
                }
                ctx = canvasTransformSrc[who+"G"].getContext('2d', {willReadFrequently:true});
            }

            // first arg is the image frame to show
            var framerec = animData[who].frames[frame[who]];

            if (animating[who] && !starting[who] && framerec) { // HD characters only update the offscreen canvas when actually animating
                if (random[who].length > 0) controlRandomWalkSuppression(who, animData[who], frame[who]);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (animData[who].recipes) {
                    var recipe = animData[who].recipes[framerec[0]];
                    for (var i = 0; i < recipe.length; i++) {
                        var iTexture = recipe[i][6];
                        var textureString = (typeof iTexture == "number" ? animData[who].textures[iTexture] : "");
    
                        var src;
                        if (textureString == 'default' && defaultTexture[who])
                            src = defaultTexture[who];
                        else if (secondaryTextures[who] && secondaryTextures[who][textureString])
                            src = secondaryTextures[who][textureString];
                        else
                            src = texture[who];
                        
                        var png = (data.scene[who + "BackgroundType"] == "transparent" || animData[who].layered || clientScale(who));
                                        
                        var process = recipe[i][7]||0;
                        if (process >= 11 && process < 20) updateRandomWalk(who, process);
                        if (process == 1 || process == 2) {
                            var o = updateTransform(src, recipe, i, who);
                            ctx.drawImage(canvasTransformDst[who+process],
                                          0, 0,
                                          recipe[i][4], recipe[i][5],
                                          recipe[i][0] + o.x, recipe[i][1] + o.y,
                                          recipe[i][4], recipe[i][5]);                    
                        }
                        else if (png) {
                            // png characters replacement overlays with alpha need to first clear bits they replace e.g. hands up
                            if (!animData[who].layered && process != 3) {
                                ctx.clearRect(
                                    recipe[i][0], recipe[i][1],
                                    recipe[i][4], recipe[i][5]
                                );
                            }
                            ctx.drawImage(src,
                                recipe[i][2], recipe[i][3] + (process >= 11 && process < 20 ? recipe[i][5] * random[who][process - 10].frame : 0),
                                recipe[i][4], recipe[i][5],
                                recipe[i][0], recipe[i][1] + (process == 3 ? animData[who].clothingOverhang||0 : 0), // in HD process 3 (clothing), clothing can be artificially high by clothingOverhang pixels, and needs to be shifted down again here
                                recipe[i][4], recipe[i][5]);
                        }
                        else {
                            var buf = i > 1 ? 0 : 0; // jpeg edges are fuzzy
                            ctx.drawImage(src,
                                recipe[i][2] + buf, recipe[i][3] + buf,
                                recipe[i][4] - buf*2, recipe[i][5] - buf * 2,
                                recipe[i][0] + buf, recipe[i][1] + buf,
                                recipe[i][4] - buf*2, recipe[i][5] - buf*2);
                        }
                    }
                }
                else { // simpler, strip format
                    ctx.drawImage(texture[who], 0, 0, data.width, data.height, 0, 0, data.width, data.height);
                }
            
                // third arg is an extensible side-effect string that is triggered when a given frame is reached
                if (animData[who].frames[frame[who]][2])
                    onEmbeddedCommand(animData[who].frames[frame[who]][2]);
                // second arg is -1 if this is the last frame to show, or a recovery frame to go to if stopping early
                var recoveryFrame = animData[who].frames[frame[who]][1];
                if (recoveryFrame == -1)
                    frame[who] = -1;
                else if (stopping[who] && recoveryFrame)
					frame[who] = recoveryFrame;
            }
            
            if (swaying) { // for HD characters, this is where the actual canvas gets updated - often the offscreen canvas will remain unchanged
                updateGlobalTransform(who, canvas);
            }
        }
        
        for (var who in completed) {
            animating[who] = false;
            idling[who] = false;
            stopping[who] = false;
            frame[who] = undefined;
        }
        for (var who in completed)
            animateComplete(who);

        rafid = requestAnimationFrame(animate);
    }

    // Needed for HD characters only
    
    function initRandomWalk(who, animData) {
        random[who] = [];
        for (var n = 1; n <= 9; n++) {
            var s = animData["random"+n];
            if (s) random[who][n] = {frame:0, inc:0, count:0, frames:parseInt(s.split(",")[0])};
        }
    }

    function controlRandomWalkSuppression(who, animData, frame) {
        // Are layers with random process present in the next 6 frames? If so, suppressRandom = true, else false.
        var present = true;
        try {
            for (var d = 0; d < 6; d++) {
                var frameTest = frame + d;
                if (animData.frames[frameTest][1] == -1 || stopping && animData.frames[frameTest][1]) break; // stop searching when we run out of frames
                var framerec = animData.frames[frameTest];
                var recipe = animData.recipes[framerec[0]];
                var found = false;
                for (var i = 0; i < recipe.length; i++) {
                    var process = recipe[i][7]||0;
                    if (process >= 11 && process < 20) {found = true; break;}
                }
                if (!found) {present = false; break;}
            }
        } catch(e) {}
        suppressRandom[who] = !present;
    }

    function updateRandomWalk(who, process) {
        var n = process - 10;
        var randomrec = random[who][n];
        // drive rapidly to frame 1
        if (suppressRandom[who]) {
            if (randomrec.frame > 1) randomrec.frame = Math.round(randomrec.frame/2);
            randomrec.count = 0;
            randomrec.inc = 0;
            return;
        }
        // execute a count of steps in a given direction
        if (randomrec.count > 0) {
            randomrec.frame = Math.max(0, Math.min(randomrec.frames-1, randomrec.frame + randomrec.inc));
            randomrec.count--;
        }
        // choose new random direction and count
        else {
            randomrec.count = Math.floor(randomrec.frames/3) + Math.floor(Math.random() * randomrec.frames);
            randomrec.inc = Math.random() < 0.5 ? -1 : 1;
        }
    }    
    
    function updateTransform(src, recipe, i, who) {
        // Gather params
        var width = recipe[i][4];
        var height = recipe[i][5];
        var xSrcImage = recipe[i][0];
        var ySrcImage = recipe[i][1];
        var process = recipe[i][7];
        var rb = process == 1 ? animData[who].mouthBendRadius : (process == 2 || animData[who].jawBendRadius != undefined ? animData[who].jawBendRadius : 0);
        var rt = process == 1 ? animData[who].mouthTwistRadius : (process == 2 || animData[who].jawTwistRadius != undefined ? animData[who].jawTwistRadius : 0);
        var bend = - recipe[i][8] / 180 * Math.PI;
        var twist = recipe[i][9] / 180 * Math.PI;
        var side = recipe[i][10] / 180 * Math.PI;
        side += twist * animData[who].twistToSide;
        bend += side * (animData[who].sideToBend||0);
        var sideLength = animData[who].sideLength;
        var lowerJawDisplacement = animData[who].lowerJawDisplacement;
        var lowerJaw = recipe[i][8];
        var x = recipe[i][11];
        var y = recipe[i][12];
        // Bend/twist are a non-linear z-rotate - side and x,y are linear - prepare a matrix for the linear portion.
        // 0 2 4 
        // 1 3 5
        var m = [1, 0, 0, 1, 0, 0];
        if (side) {
            addXForm(1, 0, 0, 1, 0, -sideLength, m);
            addXForm(Math.cos(side), Math.sin(side), -Math.sin(side), Math.cos(side), 0, 0, m);
            addXForm(1, 0, 0, 1, 0, sideLength, m);
        }
        if (x || y) {
            addXForm(1, 0, 0, 1, x, y, m);
        }
        // Extract the portion of the image we want to a new temp context and get its bits as the source
        if (!canvasTransformSrc[who+process]) {
            canvasTransformSrc[who+process] = document.createElement('canvas');
            canvasTransformSrc[who+process].width = width;
            canvasTransformSrc[who+process].height = height;
        }
        canvasTransformSrc[who+process].getContext('2d', {willReadFrequently:true}).clearRect(0, 0, width, height);
        canvasTransformSrc[who+process].getContext('2d', {willReadFrequently:true}).drawImage(src, recipe[i][2], recipe[i][3], width, height, 0, 0, width, height);
        var source = canvasTransformSrc[who+process].getContext('2d', {willReadFrequently:true}).getImageData(0, 0, width, height);
        // Get the bits for a same-size region
        if (!canvasTransformDst[who+process]) {
            canvasTransformDst[who+process] = document.createElement('canvas');
            canvasTransformDst[who+process].width = width;
            canvasTransformDst[who+process].height = height;
        }
        var target = canvasTransformSrc[who+process].getContext('2d', {willReadFrequently:true}).createImageData(width, height);
        // Return the image displacement
        var deltax = 0;
        var deltay = 0;
        if (process == 1 || animData[who].jawBendRadius != undefined) {
            // Assume same size for destination image as for src, and compute where the origin will fall
            var xDstImage = Math.floor(xSrcImage + rt * Math.sin(twist));
            var yDstImage = Math.floor(ySrcImage - rb * Math.sin(bend));
            deltax = xDstImage - xSrcImage;
            deltay = yDstImage - ySrcImage;
            // Setup feathering
            var a = width / 2;
            var b = height / 2;
            var fudge = Math.round(width/40) - 1;            
            var xp = width - 5 - fudge; // 5 pixel feathering
            var xpp = width - fudge; // but don't consider very edge pixels, at least in hi res
            var vp = (xp-a)*(xp-a)/(a*a);
            var vpp = (xpp-a)*(xpp-a)/(a*a);
            // Main loop
            var xDstGlobal,yDstGlobal,xSrcGlobalZ,ySrcGlobalZ,xSrcGlobal,ySrcGlobal,xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
            var offDst = 0;
            for (var yDst = 0; yDst < height; yDst++) {
                for (var xDst = 0; xDst < width; xDst++) {
                    xDstGlobal = xDst + 0.001 - width/2 + deltax ;
                    yDstGlobal = yDst + 0.001 - height/2 + deltay;
                    // z-rotate on an elliptic sphere with radius rb, rt
                    xSrcGlobalZ = rt * Math.sin(Math.asin(xDstGlobal/rt) - twist);
                    ySrcGlobalZ = rb * Math.sin(Math.asin(yDstGlobal/rb) + bend);
                    xSrcGlobal = m[0] * xSrcGlobalZ + m[2] * ySrcGlobalZ + m[4];
                    ySrcGlobal = m[1] * xSrcGlobalZ + m[3] * ySrcGlobalZ + m[5];
                    xSrc = xSrcGlobal + width/2;
                    ySrc = ySrcGlobal + height/2;
                    // bilinear interpolation - https://en.wikipedia.org/wiki/Bilinear_interpolation
                    x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                    x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                    y1Src = Math.max(Math.min(Math.floor(ySrc), height-1), 0);
                    y2Src = Math.max(Math.min(Math.ceil(ySrc), height-1), 0);
                    if (x1Src == x2Src) {
                        if (x1Src == 0) x2Src++; else x1Src--;
                    }
                    if (y1Src == y2Src) {
                        if (y1Src == 0) y2Src++; else y1Src--;
                    }
                    // ImageData pixel ordering is RGBA
                    offSrc1 = y1Src*4*width + x1Src*4;
                    offSrc2 = y1Src*4*width + x2Src*4;
                    offSrc3 = y2Src*4*width + x1Src*4;
                    offSrc4 = y2Src*4*width + x2Src*4;
                    rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                    gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                    bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                    var alpha;
                    if (process == 1) {
                        var v = (xDst-a)*(xDst-a)/(a*a) + (yDst-b)*(yDst-b)/(b*b);
                        if (v > vpp) 
                            alpha = 0;
                        else if (v >= vp && v <= vpp) 
                            alpha = Math.round(255 * ((Math.sqrt(vpp) - Math.sqrt(v))/(Math.sqrt(vpp) - Math.sqrt(vp))));
                        else
                            alpha = 255;
                    }
                    else if (process == 2) {
                        alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                        if (alpha < 222) alpha = 0; else alpha = 255;
                        if (yDst < height/10)
                            alpha = Math.min(alpha, yDst /  (height/10) * 255);
                    }
                    else {
                        alpha = 255;
                    }
                    target.data[offDst] = rint; offDst++;
                    target.data[offDst] = gint; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha; offDst++;
                }
            }
        }
        else if (process == 2) {
            var xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
            var offDst = 0;
            for (var yDst = 0; yDst < height; yDst++) {
                for (var xDst = 0; xDst < width; xDst++) {
                    xSrc = xDst;
                    ySrc = yDst - (lowerJaw * lowerJawDisplacement * yDst / height);
                    x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                    x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                    y1Src = Math.max(Math.min(Math.floor(ySrc), height-1), 0);
                    y2Src = Math.max(Math.min(Math.ceil(ySrc), height-1), 0);
                    if (x1Src == x2Src) {
                        if (x1Src == 0) x2Src++; else x1Src--;
                    }
                    if (y1Src == y2Src) {
                        if (y1Src == 0) y2Src++; else y1Src--;
                    }
                    offSrc1 = y1Src*4*width + x1Src*4;
                    offSrc2 = y1Src*4*width + x2Src*4;
                    offSrc3 = y2Src*4*width + x1Src*4;
                    offSrc4 = y2Src*4*width + x2Src*4;
                    rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                    gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                    bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                    var alpha;
                    alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                    if (alpha < 222) alpha = 0; else alpha = 255;
                    if (yDst < height/10)
                        alpha = Math.min(alpha, yDst /  (height/10) * 255);
                    target.data[offDst] = rint; offDst++;
                    target.data[offDst] = gint; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha; offDst++;
                }
            }
        }
        canvasTransformDst[who+process].getContext('2d').putImageData(target, 0, 0);
        return {x:deltax, y:deltay};
    }
    
    function updateGlobalTransform(who, canvas) {
        var width = canvas.width;
        var height = canvas.height;
        var swayLength = animData[who].swayLength;
        var swayBorder = animData[who].swayBorder;
        var swayProcess = animData[who].swayProcess||1;        
        // 0 2 4 
        // 1 3 5
        var m = [1, 0, 0, 1, 0, 0];
        var m1 = [1, 0, 0, 1, 0, 0];
        var m2 = [1, 0, 0, 1, 0, 0];
        var hipx;
        if (swayProcess == 1) { // note sway expressed in radians throughout
            // pivot around a point swayLength below image center, around where hips would be (assumes sitting)        
            addXForm(1, 0, 0, 1, 0, -swayLength, m);
            addXForm(Math.cos(sway[who]), Math.sin(sway[who]), -Math.sin(sway[who]), Math.cos(sway[who]), 0, 0, m);
            addXForm(1, 0, 0, 1, 0, swayLength, m);
        }
        else if (swayProcess == 2) {
            // assume character centered vertically with feet at or near bottom - use m1 from a point at the bottom to sway bottom half of image one way,
            // compute that hip displacement hipx, then use m1 to sway the top half in half the amount, shifted by hipx, the other way. Interpolate in the middle.
            addXForm(1, 0, 0, 1, 0, -height/2, m2);
            addXForm(Math.cos(-sway[who]), Math.sin(-sway[who]), -Math.sin(-sway[who]), Math.cos(-sway[who]), 0, 0, m2);
            addXForm(1, 0, 0, 1, 0, height/2, m2);
            hipx = height/2 * Math.tan(sway[who]);
            addXForm(1, 0, 0, 1, 0, 0, m1);
            addXForm(Math.cos(sway[who]/2), Math.sin(sway[who]/2), -Math.sin(sway[who]/2), Math.cos(sway[who]/2), 0, 0, m1);
            addXForm(1, 0, 0, 1, 0, 0, m1);
        }
        var overhang = (animData[who].clothingOverhang||0);
        var source = canvasTransformSrc[who+"G"].getContext('2d', {willReadFrequently:true}).getImageData(0, 0, width, height + overhang);
        var target = canvas.getContext('2d', {willReadFrequently:true}).createImageData(width, height);
        var xDstGlobal,yDstGlobal,xSrcGlobal,ySrcGlobal;
        var xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
        var offDst = 0;
        var a = []; // optimize inner loop
        for (var xDst = 0; xDst < width; xDst++) {
            a[xDst] = breath[who] * (Math.cos(xDst * 2*Math.PI/width)/2 + 0.5);        
        }
        for (var yDst = 0; yDst < height; yDst++) {
            for (var xDst = 0; xDst < width; xDst++) {
                if (swayBorder && (xDst < swayBorder || xDst > width-swayBorder)) { // optimization - our body characters have a lot of blank space on sides
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    continue;
                }                
                xDstGlobal = xDst + 0.001 - width/2;
                yDstGlobal = yDst + 0.001 - height/2;
                if (swayProcess == 1) {
                    xSrcGlobal = m[0] * xDstGlobal + m[2] * yDstGlobal + m[4];
                    ySrcGlobal = m[1] * xDstGlobal + m[3] * yDstGlobal + m[5];
                }
                else if (swayProcess == 2) {
                    var overlap = height/10; // vertical distance from height/2 in which we interpolate between the two transforms
                    if (yDst < height/2 - overlap) {
                        xSrcGlobal = -hipx + m1[0] * xDstGlobal + m1[2] * yDstGlobal + m1[4];
                        ySrcGlobal = m1[1] * xDstGlobal + m1[3] * yDstGlobal + m1[5];
                    }
                    else if (yDst < height/2 + overlap) {
                        var xSrcGlobal1,ySrcGlobal1,xSrcGlobal2,ySrcGlobal2;
                        xSrcGlobal1 = -hipx + m1[0] * xDstGlobal + m1[2] * yDstGlobal + m1[4];
                        ySrcGlobal1 = m1[1] * xDstGlobal + m1[3] * yDstGlobal + m1[5];
                        xSrcGlobal2 = m2[0] * xDstGlobal + m2[2] * yDstGlobal + m2[4];
                        ySrcGlobal2 = m2[1] * xDstGlobal + m2[3] * yDstGlobal + m2[5];
                        var f = (yDst - (height/2 - overlap)) / (overlap * 2);
                        xSrcGlobal = xSrcGlobal1*(1-f) + xSrcGlobal2*f;
                        ySrcGlobal = ySrcGlobal1*(1-f) + ySrcGlobal2*f;
                    }
                    else {
                        xSrcGlobal = m2[0] * xDstGlobal + m2[2] * yDstGlobal + m2[4];
                        ySrcGlobal = m2[1] * xDstGlobal + m2[3] * yDstGlobal + m2[5];
                    }
                }
                xSrc = xSrcGlobal + width/2;
                ySrc = ySrcGlobal + height/2;
                ySrc -= a[xDst];
                x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                y1Src = Math.max(Math.min(Math.floor(ySrc), height+overhang-1), 0);
                y2Src = Math.max(Math.min(Math.ceil(ySrc), height+overhang-1), 0);
                if (x1Src == x2Src) {
                    if (x1Src == 0) x2Src++; else x1Src--;
                }
                if (y1Src == y2Src) {
                    if (y1Src == 0) y2Src++; else y1Src--;
                }
                offSrc1 = y1Src*4*width + x1Src*4;
                offSrc2 = y1Src*4*width + x2Src*4;
                offSrc3 = y2Src*4*width + x1Src*4;
                offSrc4 = y2Src*4*width + x2Src*4;
                rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                var alpha;
                alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                target.data[offDst] = rint; offDst++;
                target.data[offDst] = gint; offDst++;
                target.data[offDst] = bint; offDst++;
                target.data[offDst] = alpha; offDst++;
            }
        }
        canvas.getContext('2d').putImageData(target, 0, 0);
    }    
    
    function addXForm(a, b, c, d, e, f, m) {
        // a c e   ma mc me
        // b d f . mb md mf  
        // 0 0 1   0  0  1 
        m[0] = a * m[0] + c * m[1];     m[2] = a * m[2] + c * m[3];     m[4] = a * m[4] + c * m[5] + e; 
        m[1] = b * m[0] + d * m[1];     m[3] = b * m[2] + d * m[3];     m[5] = b * m[4] + d * m[5] + f;
    }
    
    function stopAll() {
        if (audioContext) {
            if (gainNode) gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
            timeSinceLastAudioStopped = Date.now();
        }
        for (var who in roles) {
            if (loading[who] || animating[who])
                stopping[who] = true;
            if (deferredExecute[who]) {
                deferredExecute[who] = null;
                onScriptLineDone();
            }
            if (delayTimeout[who]) {
                clearTimeout(delayTimeout[who]);
				delayTimeout[who] = 0;
                animateComplete(who);
			}
            if (settleTimeout[who]) {
                clearTimeout(settleTimeout[who]);
                settleTimeout[who] = 0;
                animating[who] = false;
                idling[who] = false;
                animateComplete(who);
            }
        }
    }

    function animateFailed(who) {
        console.log("People Builder service error");
        atLeastOneLoadError = true;
        loading[who] = false;
        animateComplete(who);
    }

    function animateComplete(who) {
        timeSinceLastAction[who] = 0;  // used in checkIdle

        if (!loaded[who]) {
            loaded[who] = true;

            // Pick up default texture if we are loading character for the first time
            if (!defaultTexture[who] && texture[who] && animData[who] && animData[who].recipes)
                defaultTexture[who] = texture[who];         

            timeSinceLastBlink[who] = 0;
            
            characterLoaded(who);
        }
        else {
            if (audioSource[who]) {
                audioSource[who] = null;
                timeSinceLastAudioStopped = Date.now();
            }
            if (executeCallback[who]) {
                var t = executeCallback[who];
                executeCallback[who] = null;
                if (t) t();
            }
        }
    }

    function isVector(role) {
        if (data.scene[role + "CharacterType"] !== undefined) return data.scene[role + "CharacterType"] == "vector";
        var style = data.scene[role + "CharacterStyle"]||""; // old way going away
        return style.split("-")[0] == "illustrated" || style == "cs" || style == "classic";
    }
    
    function clientScale(role) {
        return scenePreviewMode || (!isVector(role) && (data.scene[role + "CharacterScale"]||100) != 100 * (data.scene[role + "CharacterDensity"]||1)) || data.scene[role + "CharacterRequiresPng"];
    }

    function getIdles(role) {
        var idleData = data.scene[role + "CharacterIdleData"];
        if (!idleData["none"]) idleData["none"] = [];        
        if (idleData) {
            var a = [];
            for (var i = 0; i < idleData[idleType].length; i++) {
                var s = idleData[idleType][i];
                var m = s.match(/([a-z]+)([0-9]+)-([0-9]+)/);
                if (m) {
                    for (var i = parseInt(m[2]); i <= parseInt(m[3]); i++)
                        a.push(m[1] + i);
                }
                else {
                    a.push(s);
                }
            }
            return a;
        }
        else {
			console.log("missing idleData");
            return [];			
        }
    }
    
    //
    // Idle
    //

    function startIdle() {
        if (!idleTimeout) idleTimeout = setTimeout(checkIdle, 1000)
    }

    function checkIdle() {
        // Called every second until cleanup
        var t = Date.now();
        var elapsed = t - (timeSinceLastIdleCheck||t);
        timeSinceLastIdleCheck = t;
        for (var who in roles) {
            timeSinceLastAction[who] += elapsed;
            timeSinceLastBlink[who] += elapsed;
        }

        // Chat idle uses the same time, but is otherwise independent
        var found = false;
        for (who in roles) {
            if (!scenePreviewMode && loaded[who] && (!loading[who]||idling[who]) && (!animating[who]||idling[who]) && !atLeastOneLoadError && !replying && isSolidVisible(who)) {
                found = true;
            }
        }
        if (found) onChatIdle();
        
        for (who in roles) {
            if (!scenePreviewMode && loaded[who] && !loading[who] && !animating[who] && !atLeastOneLoadError && !replying) {
                if (timeSinceLastAction[who] > 1500 + Math.random() * 3500) {  // no more than 5 seconds with no action whatsoever
                    timeSinceLastAction[who] = 0;
					var idles = getIdles(who);
					var idle = null;
					var hasBlinkIdle = idles.length > 0 && idles[0] == "blink"; // if blink is the first idle then it is expected to be randomly interleaved with the other idles on it's own schedule
					// There WILL be an action - will it be a blink? Blinks must occur at a certain frequency. But many characters incorporate blink into idle actions.
					if (hasBlinkIdle && timeSinceLastBlink > 5000 + Math.random() * 5000) {
						timeSinceLastBlink = 0;
						idle = "blink";
					}
					// Or another idle routine?
					else {
						if (hasBlinkIdle) idles.shift();
						// pick an idle that does not repeat - favor the first idle listed first - give us a chance to start with something quick/important to fetch
						if (idles.length > 0) {
							if (!lastIdle) { 
								idle = idles[0];
							}
							else {
								for (var guard = 10; guard > 0; guard--) {
									idle = idles[Math.floor(Math.random() * idles.length)];
									if (idle == lastIdle) continue;
									break;
								}
							}
						}
						if (idle) lastIdle = idle;
					}
					if (idle) {
						execute(who, "&idle="+idle, idle, null, null, onIdleComplete.bind(null, who));
						break;
					}
				}
            }
        }
        idleTimeout = setTimeout(checkIdle, 1000);
    }
    
    function stopIdle() {
        if (idleTimeout) clearTimeout(idleTimeout);
        idleTimeout = null;
    }

    //
    // Cleanup - all timers stopped, resources dropped, etc.
    //

    this.cleanup = function() {
        stopAll();
        if (idleTimeout) clearTimeout(idleTimeout);
        if (preloadTimeout) clearTimeout(preloadTimeout);
        if (rafid) cancelAnimationFrame(rafid);
        rafid = null;
        var div = document.getElementById(divid);
        if (div) div.innerHTML = "";
        resetInnerVars();
        resetOuterVars();
    }

    function simpleHash(s) {
        var hash = 0;
        if (s.length == 0) {
            return hash;
        }
        for (var i = 0; i < s.length; i++) {
            var char = s.charCodeAt(i);
            hash = ((hash<<5)-hash)+char;
            hash = hash & hash; // Convert to 32bit integer
        }
        hash = Math.abs(hash);
        return hash.toString();
    }

    //
    // Fader
    //

    function fadeInChar() {
        var topDiv = document.getElementById(divid + "-top");
        inFade = true;
        fadeIn(topDiv, 400, function() {
            inFade = false; 
            sceneFullyFadedIn();
        });
    }
    
    function fadeOutChar() {
        var topDiv = document.getElementById(divid + "-top");
        inFade = true;
        fadeOut(topDiv, 400, function() {
            inFade = false;
        });
    }

    function fadeIn(elem, ms, fn)
    {
        // opacity non-1 only while animating
        elem.style.opacity = 0;
        elem.style.visibility = "visible";
        if (ms)
        {
            var opacity = 0;
            var timer = setInterval( function() {
                opacity += 50 / ms;
                if (opacity >= 1)
                {
                    clearInterval(timer);
                    opacity = 1;
                    if (fn) fn();
                }
                elem.style.opacity = opacity;
            }, 50 );
        }
        else
        {
            elem.style.opacity = 1;
            if (fn) fn();
        }
    }

    function fadeOut(elem, ms, fn)
    {
        // opacity non-1 only while animating
        if (ms)
        {
            var opacity = 1;
            var timer = setInterval(function() {
                opacity -= 50 / ms;
                if (opacity <= 0)
                {
                    clearInterval(timer);
                    opacity = 1;
                    elem.style.visibility = "hidden";
                    if (fn) fn();
                }
                elem.style.opacity = opacity;
            }, 50 );
        }
        else
        {
            elem.style.opacity = 1;
            elem.style.visibility = "hidden";
            if (fn) fn();
        }
    }

    //
    // Play Shield
    //

    function setupPlayShield(cx, cy)
    {
        var e = document.getElementById(divid + "-playshield-canvas")
        if (e)
        {
            // Background
            var ctx = e.getContext('2d');
            ctx.fillStyle= "#000000";
            ctx.globalAlpha=0.5;
            ctx.fillRect(0,0,cx,cy);

            var x = cx/2;
            var y = cy/2;

            // Inner
            ctx.beginPath();
            ctx.arc(x, y , 25, 0 , 2*Math.PI, false);
            ctx.fillStyle = "#999999";
            ctx.globalAlpha = 0.5;
            ctx.fill();

            // Outer
            ctx.beginPath();
            ctx.arc(x, y , 27, 0 , 2*Math.PI, false);
            ctx.strokeStyle = "#cccccc";
            ctx.lineWidth = 5;
            ctx.globalAlpha = 1;
            ctx.stroke();

            // Triangle
            ctx.beginPath();
            x -= 12; y -= 15;
            ctx.moveTo(x, y);
            y += 30;
            ctx.lineTo(x, y);
            y -= 15; x += 30;
            ctx.lineTo(x, y);
            y -= 15; x -= 30;
            ctx.lineTo(x, y);
            ctx.fillStyle = "#cccccc";
            ctx.globalAlpha = 1;
            ctx.fill();

            e.onclick = onPlayShieldClick;
        }
    }
    
    //
    // Misc
    //
     
    function createEvent(s, o) {
        if (typeof(Event) === 'function') {
            return new CustomEvent(s, {detail:o});
        } 
        // IE no-longer supported
    }
    
    function updateSway(who, framesSway) {
        if (swayTarget[who] == undefined || Math.abs(sway[who] - swayTarget[who]) < 0.001) {
            if (that.playing) {
                swayTarget[who] = -animData[who].normalSwayRange + Math.random() * animData[who].normalSwayRange * 2;
                swayAccel[who] = animData[who].normalSwayAccelMin + (animData[who].normalSwayAccelMax - animData[who].normalSwayAccelMin) * Math.random();
            }
            else {
                swayTarget[who] = -animData[who].idleSwayRange + Math.random() * animData[who].idleSwayRange * 2;
                swayAccel[who] = animData[who].idleSwayAccelMin + (animData[who].idleSwayAccelMax - animData[who].idleSwayAccelMin) * Math.random();
            }
        }
        while (framesSway > 0) {
            sway[who] += (swayTarget[who] - sway[who]) * swayAccel[who];
            framesSway--;
        }
    }
    
    function updateBreath(who) {
        breath[who] = (animData[who].shoulderDisplacement||0) * Math.max(0, Math.sin(breathTime[who] * 2 * Math.PI / animData[who].breathCycle));
        breathTime[who] += fpsInterval;
    }
}
