# React Embodied Agent
Add an embodied agent to your React app! These realistic and cartoon characters can speak pre-authored and/or dynamic messages, with recorded or Text-to-Speech (TTS) audio, actions, emotions, and lip-sync.

![example](https://github.com/mediasemantics/react-embodied-agent/raw/main/docs/img/example.png)

## Creating your module
Head over to [https://mediasemantics.com](https://mediasemantics.com) and sign up for the People Builder service (free for a week, and as little as $10/month thereafter). Use the Modules tab, and use the **Add** button to create an Interactive Agent module. Configure your character's appearance, voice, background, and messages. Test it in the Preview tab. Return to the Modules tab, press the **Publish** button to publish your module, and then press **Get Embed Code**. You will see a React embed code similar to the following:

```javascript
<ReactEmbodiedAgent ref={this.myAgentRef} style={{width:"250px", height:"200px"}} userid="12345678" moduleid="12345678" />
```

(The userid and moduleid will be different in your code.)

You can use [Create React App](https://create-react-app.dev/) and the following App.js file to turn your tag into a web page.

```javascript
import { useRef } from 'react';
import ReactEmbodiedAgent from 'react-embodied-agent';
function App() {
    const myAgentRef = useRef(null);
    return ( 
        <ReactEmbodiedAgent ref={myAgentRef} style={{width:"250px", height:"200px"}} userid="12345678" moduleid="12345678" /> 
     );
}
export default App;
```

If you prefer the class syntax, you can use the equivalent class code:

```javascript
import React, { Component } from 'react';
import ReactEmbodiedAgent from 'react-embodied-agent';
class App extends Component {
    constructor() {
        super();
        this.myAgentRef = React.createRef();
    }
    render() {
        return ( 
            <ReactEmbodiedAgent ref={this.myAgentRef} style={{width:"250px", height:"200px"}} userid="12345678" moduleid="12345678" />
        );
    }
}
export default App;
```

## Playing messages

Use the `play()` method to trigger a message. Say you've used the People Builder's Messages tab to create a message named "Intro". 

![message](https://github.com/mediasemantics/react-embodied-agent/raw/main/docs/img/message.png)

To play the "Intro" message, you use:

```javascript
myAgentRef.current.play("Intro");
```

If you are using the class syntax, use:

```javascript
this.myAgentRef.current.play("Intro");
```

You might run these commands in response to a button, e.g.

```javascript
<button onClick={ () => myAgentRef.current.play("Intro") }>play</button>
```

You can use the `stop()` method to smoothly stop any playing messages. It's a good idea to do this before a `play()` if you want to
interrupt any messages that may be playing:

```javascript
myAgentRef.current.stop();
myAgentRef.current.play("Goodbye");
```

Without the stop(), the "Goodbye" message would simply be queued up, and would play as soon as the current message is finished.

## Reacting to events

One important event is `onModuleLoaded`, which indicates that the module is loaded, that it's about to be displayed, and that it's ready to receive `play()` commands. Another event is `onPlayComplete`, which indicates that any playing messages have completed, and the agent has returned to the idle state.

Listen to events in the standard React way:

```javascript
<ReactEmbodiedAgent ref={this.myAgentRef} style={{width:"250px", height:"200px"}} userid="12345678" moduleid="12345678" 
   onModuleLoaded={ () => console.log("module loaded") } />
```

## Handling updates

You can have as many messages as you like. Playing messages is a bit like pulling strings on a puppet.

If you want to change a message, you can do so in the People Builder. 

As soon as you Publish your changes to the module, they will instantly become live within your app. You do need to be connected to the internet, and have an active People Builder subscription, in order for the play() method to work. (To avoid this, you can also look into the Download HTML5 option in People Builder.)

## Dynamic messages

If your message is not known at author-time, then you can also use the `dynamicPlay()` method. Say you want to include your user's name:

```javascript
myAgentRef.current.dynamicPlay({do: "greet", say: "Welcome back, " + name + "."});
```

A message can consist of several sentences. Each sentence can have an associated "do" action, which you can think of as the manner in which the sentence is spoken. The "do" field values come straight from the dropdown at the beginning of each line in the Builder: just convert to lower-case and replace spaces with "-". 

If you have several sentences, then you should speak them back-to-back. A typical pattern for dynamicPlay is:

```javascript
myAgentRef.current.stop();
myAgentRef.current.dynamicPlay({do: "greet", say: "Welcome back, " + name + "."});
myAgentRef.current.dynamicPlay({say: "Can I tell you what happened while you were gone?"});
```

When you call dynamicPlay, the `{do, say}` record is added to the queue. The agent begins speaking as soon as the first record is added. When the sentence is complete, the record is removed from the queue and the next record begins. 

Maybe you have a paragraph of text to speak. You can use the following code to break it down into a series of dynamicPlay statements:

```javascript
function speakParagraph(paragraph) {
     myAgentRef.current.stop();
     let records = myAgentRef.current.scriptFromText(paragraph); // breaks into sentences
     for (let record of records)
          myAgentRef.current.dynamicPlay(record);
}
```

Breaking the paragaph down into sentences is necessary in order to lower the latency and to avoid a 255 character limit on the length of the "say" field.

## Preloading messages

You can preload any message by using the `preloadPlay()` and `preloadDynamicPlay()` API. These work just like the regular `play()` and `dynamicPlay()` API, but simply ensure that any required resources are cached in the local browser cache.

## Timing UI changes with your message

You can embed arbitrary commands in your message script that are surfaced as the `onScriptCommand` event in the `event.detail` field.

![command](https://github.com/mediasemantics/react-embodied-agent/raw/main/docs/img/command.png)

```javascript
<ReactEmbodiedAgent ref={this.myAgentRef} style={{width:"250px", height:"200px"}} userid="12345678" moduleid="12345678" 
   onScriptCommand={ (e) => processCommand(e.detail) } />
```

You often use commands with "do" actions such as "Look" and "Point". When you do, the event occurs at a "natural" point in the action. The command is just a string, and you can apply your own rules on how to interpret it.

```javascript
function processCommand(s) {
    let command = s.split(" ")[0];
    let arg = s.split(" ")[1];
    if (command == "show") show(arg);
}
```

## Additional API

This Readme covers the basics, but please visit our [documentation](https://mediasemantics.com/KB112.html) for a full description of the API.