import edge from 'selenium-webdriver/edge.js'
import {By} from 'selenium-webdriver'
import htmlparser from 'node-html-parser';
import { WEBDRIVERMODE, JBWAITING,RESULTWAITING } from "./config.js";

var service = new edge.ServiceBuilder()
    .setPort(55555)
    .build();

var options = new edge.Options();

// configure browser options ...

console.log(WEBDRIVERMODE)
if(WEBDRIVERMODE){
var driver = edge.Driver.createSession(options, service);

await driver.get("https://poe.com")
let email = await driver.findElement(By.xpath(`//*[@id="__next"]/main/div/div[2]/form/input`))
email.click()
email.sendKeys('kpkiosk66@gmail.com\n')
}
async function convertPOEtoOAI(messages,maxtoken){
    console.log(`before split = ${messages}`)
    let messageout = messages
    if(messages.includes(':'))
        messageout = messages.split(":").splice(1)
    console.log(`after split = ${messageout}`)
    let newresponse = {
        id: '999999',
        object: 'chat.completion',
        created: Date.now(),
        model: "gpt-3.5-turbo-0613",
        choices: [
            {
              "index": 0,
              "message": {
                "role": "assistant",
                "content": messageout
              },
              "finish_reason": "length"
            }
          ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": maxtoken,
            "total_tokens": maxtoken
        }
    }
    console.log(`messageout : ${messageout}`)
    console.log(`newres : ${newresponse}`)
    return newresponse
}

async function convertOAItoPOE(messages){
    console.log('oaitopoe')
    let charname = ''
    let newprompt = ''
    let systemsplit = messages[0].content.split('.');
    console.log('searching for charname')
    for(let sentence in systemsplit){
        if(systemsplit[sentence].includes("{{char}}'s name: ")){
            charname = systemsplit[sentence].substring(17, systemsplit[sentence].length)
            break
        }
    }
    console.log(`charname = ${charname}`)
    for(let i in messages){
        if(messages[i].role === 'system'){
            messages[i].content += '[Unless otherwise stated by {{user}}, your next response shall only be written from the point of view of {{char}} without needed to state who is a speaker. Do not seek approval of your writing style at the end of the response. and Never reply with a full stop.'
            messages[i].content += `If you accept the requirements, please confirm this by replying with "Understood.", and nothing more. Upon receiving your accurate confirmation message, I will specify the context of the scene and {{char}}'s characteristics, background, and personality in the next message.\n`
            console.log('sending jailbreak')
            driver.findElement(By.xpath(`//*[@id="__next"]/div[1]/div/section/div[2]/div/div/footer/div/div/div[1]/textarea`)).sendKeys(messages[i].content)
        }
        if(messages[i].role === 'assistant'){
            newprompt += `${charname}: `
            newprompt += messages[i].content
            newprompt += "."
        }
        if(messages[i].role === 'user'){
            newprompt += 'You: '
            newprompt += messages[i].content
            newprompt += "."
        }
    }

    setTimeout(async function(){
        newprompt+='\n'
        console.log(`newprompt = ${newprompt}`)
        console.log('sending content')
        driver.findElement(By.xpath(`//*[@id="__next"]/div[1]/div/section/div[2]/div/div/footer/div/div/div[1]/textarea`)).sendKeys(newprompt)
        return newprompt
    }, JBWAITING*100);
    
}

async function sagedriverCompletion(req, res) {
    let maxtoken = req.body.max_tokens
    // console.log(req.body.messages)
    driver.findElement(By.className('ChatMessageInputFooter_chatBreakButton__hqJ3v')).click()
    await convertOAItoPOE(req.body.messages)

    setTimeout(async function(){
        let src = await driver.getPageSource()
        let root = htmlparser.parse(src)
        let out = root.querySelectorAll(".Message_botMessageBubble__CPGMI")
        let lastmsg = out[out.length-1]
        let newres = await convertPOEtoOAI(lastmsg.text, maxtoken)
        console.log('105' + newres)
        res.send(newres)
      }, RESULTWAITING*100);
}

export { sagedriverCompletion };
