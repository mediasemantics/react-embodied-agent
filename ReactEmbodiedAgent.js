// @ts-nocheck
import React, { Component } from 'react';
import MSAgentModule from './agent';

class ReactEmbodiedAgent extends Component {
    static nextId = 1;

    constructor() {
        super();
        this.divRef = React.createRef();
        this.idDiv = "ReactEmbodiedAgent" + (ReactEmbodiedAgent.nextId++);
        this.agent = null;
        this.onModuleLoadedFn = () => this.props.onModuleLoaded && this.props.onModuleLoaded();
        this.onClosedCaptionFn = (e) => this.props.onClosedCaption && this.props.onClosedCaption(e);
        this.onEmbeddedCommandFn = (e) => this.props.onEmbeddedCommand && this.props.onEmbeddedCommand(e);
        this.onScriptCommandFn = (e) => this.props.onScriptCommand && this.props.onScriptCommand(e);
        this.onPreloadCompleteFn = () => this.props.onPreloadComplete && this.props.onPreloadComplete();
        this.onPlayCompleteFn = () => this.props.onPlayComplete && this.props.onPlayComplete();
    }

    render() {
        return (
            <div ref={this.divRef} id={this.idDiv} style={this.props.style ? this.props.style : {}}></div>
        );
    }

    componentDidMount() {
        if (!this.agent) {

            let params = {};
            if (this.props.fade !== undefined) params.fade = this.props.fade;
            if (this.props.visible !== undefined) params.visible = this.props.visible;
            if (this.props.page !== undefined) params.page = this.props.page;
            if (this.props.preload !== undefined) params.preload = this.props.preload;
            if (this.props.idleType !== undefined) params.idleType = this.props.idleType;
            if (this.props.sway !== undefined) params.sway = this.props.sway;
            if (this.props.breath !== undefined) params.breath = this.props.breath;

            this.agent = new MSAgentModule(this.idDiv, this.props.userid, this.props.moduleid, params);

            this.divRef.current.addEventListener("moduleLoaded", this.onModuleLoadedFn);
            this.divRef.current.addEventListener("closedCaption", this.onClosedCaptionFn);
            this.divRef.current.addEventListener("embeddedCommand", this.onEmbeddedCommandFn);
            this.divRef.current.addEventListener("scriptCommand", this.onScriptCommandFn);
            this.divRef.current.addEventListener("preloadComplete", this.onPreloadCompleteFn);
            this.divRef.current.addEventListener("playComplete", this.onPlayCompleteFn);
        }
    }

    componentWillUnmount() {
        if (this.agent) {
            this.agent.cleanup();
            this.agent = null;
        }
        this.divRef.current.removeEventListener("moduleLoaded", this.onModuleLoadedFn);
        this.divRef.current.removeEventListener("closedCaption", this.onClosedCaptionFn);
        this.divRef.current.removeEventListener("embeddedCommand", this.onEmbeddedCommandFn);
        this.divRef.current.removeEventListener("scriptCommand", this.onScriptCommandFn);
        this.divRef.current.removeEventListener("preloadComplete", this.onPreloadCompleteFn);
        this.divRef.current.removeEventListener("playComplete", this.onPlayCompleteFn);
    }

    volume() {
        return this.agent.volume();
    }
    setVolume(value) {
        this.agent.setVolume(value);
    }

    pauseStartup() {
        this.agent.pauseStartup();
    }
    resumeStartup() {
        this.agent.resumeStartup();
    }

    overrideIdentity(value) {
        this.agent.overrideIdentity(value);
    }

    visible() {
        return this.agent.visible();
    }
    hide() {
        this.agent.hide();
    }
    show() {
        this.agent.show();
    }
    fadeIn() {
        this.agent.fadeIn();
    }
    fadeOut() {
        this.agent.fadeOut();
    }

    setIdleType(value) {
        this.agent.setIdleType(value);
    }

    play(message) {
        this.agent.play(message);
    }
    dynamicPlay(record) {
        this.agent.dynamicPlay(record);
    }
    stop() {
        this.agent.stop();
    }
    playing() {
        return this.agent.playing();
    }

    preloadPlay(message) {
        this.agent.preloadPlay(message);
    }
    preloadDynamicPlay(record) {
        this.agent.preloadDynamicPlay(record);
    }
    preloading() {
        return this.agent.preloading();
    }

    scriptFromText(value) {
        return this.agent.scriptFromText(value);
    }


}
export default ReactEmbodiedAgent;