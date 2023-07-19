import axios from "axios";
import { Configuration, OpenAIApi } from "openai";
import {
  streamCompletion,
  generateId,
  getOpenAIKey,
  getPoeKey,
} from "./functions.js";
import { DEBUG, MODERATION } from "./config.js";
import * as poe from "./poe-client.js";
const poeClientCache = {};

async function convertOAItoPOE(bot, messages, client) {
  let charname = "";
  let newprompt = "";
  let reply;
  let systemsplit = messages[0].content.split(".");
  for (let sentence in systemsplit) {
    if (systemsplit[sentence].includes("{{char}}'s name: ")) {
      charname = systemsplit[sentence].substring(
        17,
        systemsplit[sentence].length
      );
      break;
    }
  }
  for (let i in messages) {
    if (messages[i].role === "system") {
      messages[i].content +=
        "[Unless otherwise stated by {{user}}, your next response shall only be written from the point of view of {{char}} without needed to state who is a speaker. Do not seek approval of your writing style at the end of the response. and Never reply with a full stop.\n";
      messages[
        i
      ].content += `\n\nIf you accept the requirements, please confirm this by replying with "Understood.", and nothing more. Upon receiving your accurate confirmation message, I will specify the context of the scene and {{char}}'s characteristics, background, and personality in the next message.\n\n`;
      for await (const mes of client.send_message(
        bot,
        messages[i].content,
        false,
        60
      )) {
        reply = mes.text;
      }
      console.log("isBotAcknowledge" + reply);
    }
    if (messages[i].role === "assistant") {
      newprompt += `${charname}: `;
      newprompt += messages[i].content;
      newprompt += "\n\n";
    }
    if (messages[i].role === "user") {
      newprompt += "You: ";
      newprompt += messages[i].content;
      newprompt += "\n\n";
    }
  }
  // console.log(newprompt)
  return newprompt;
}

async function convertToPrompt(messages){
    let charname = ''
    let newprompt = ''
    let reply
    let systemsplit = messages[0].content.split('.');
    for(let sentence in systemsplit){
        if(systemsplit[sentence].includes("{{char}}'s name: ")){
            charname = systemsplit[sentence].substring(17, systemsplit[sentence].length)
            break
        }
    }
    for(let i in messages){
        if(messages[i].role === 'system'){
            messages[i].content += `\n\nIf you accept the requirements, please confirm this by replying with "Understood.", and nothing more. Upon receiving your accurate confirmation message, I will specify the context of the scene and {{char}}'s characteristics, background, and personality in the next message.\n\n`
            messages[i].content += '[Unless otherwise stated by {{user}}, your next response shall only be written from the point of view of {{char}} without needed to state who is a speaker. Do not seek approval of your writing style at the end of the response. and Never reply with a full stop.\n'
            // for await (const mes of client.send_message(bot, messages[i].content, false, 60)) {
            //     reply = mes.text;
            // }
            console.log( messages[i])
            console.log( '\n\n\n\n\n\ ')
        }
        if(messages[i].role === 'assistant'){
            newprompt += `${charname}: `
            newprompt += messages[i].content
            newprompt += "\n\n"
        }
        if(messages[i].role === 'user'){
            newprompt += 'You: '
            newprompt += messages[i].content
            newprompt += "\n\n"
        }
    }
    console.log(newprompt)
    return newprompt
}

async function promptlogger(req, res) {
    console.log("promptlog")
    let cp = await convertToPrompt(req.body.messages)
    res.send(cp)
}

async function convertPOEtoOAI(messages,maxtoken){
    console.log(messages)
    let orgId = generateId();
    let messageout = messages
    if(messages.includes(':'))
        messageout = messages.split(":").splice(1)
    let newresponse = {
        id: orgId,
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
    console.log(messageout)
    return newresponse
async function convertPOEtoOAI(messages, maxtoken) {
  console.log(messages);
  let orgId = generateId();
  let messageout = messages;
  if (messages.includes(":")) messageout = messages.split(":").splice(1);
  let newresponse = {
    id: orgId,
    object: "chat.completion",
    created: Date.now(),
    model: "gpt-3.5-turbo-0613",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: messageout,
        },
        finish_reason: "length",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: maxtoken,
      total_tokens: maxtoken,
    },
  };
  console.log(messageout);
  return newresponse;
}

async function completions(req, res) {
  let orgId = generateId();
  let key = getOpenAIKey();

  if (!req.body.prompt) {
    res.set("Content-Type", "application/json");
    return res.status(400).send({
      status: false,
      error: "No prompt provided",
    });
  }

  if (DEBUG)
    console.log(
      `[Text] [${req.user.data.id}] [${req.user.data.name}] [MAX-TOKENS:${
        req.body.max_tokens ?? "unset"
      }] ${req.body.prompt}`
    );

  if (MODERATION) {
    try {
      let openAi = new OpenAIApi(new Configuration({ apiKey: key }));
      let response = await openAi.createModeration({
        input: req.body.prompt,
      });

      if (response.data.results[0].flagged) {
        res.set("Content-Type", "application/json");
        return res.status(400).send({
          status: false,
          error: "Your prompt contains content that is not allowed",
          reason: response.data.results[0].reason,
          contact: "https://discord.pawan.krd",
        });
      }
    } catch (e) {}
  }

  if (req.body.stream) {
    try {
      const response = await axios.post(
        `https://api.openai.com/v1/completions`,
        req.body,
        {
          responseType: "stream",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
        }
      );

      res.setHeader("content-type", "text/event-stream");

      for await (const message of streamCompletion(response.data)) {
        try {
          const parsed = JSON.parse(message);
          delete parsed.id;
          delete parsed.created;
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch (error) {
          if (DEBUG)
            console.error(
              "Could not JSON parse stream message",
              message,
              error
            );
        }
      }

      res.write(`data: [DONE]`);
      res.end();
    } catch (error) {
      try {
        if (error.response && error.response.data) {
          let errorResponseStr = "";

          for await (const message of error.response.data) {
            errorResponseStr += message;
          }

          errorResponseStr = errorResponseStr.replace(
            /org-[a-zA-Z0-9]+/,
            orgId
          );

          const errorResponseJson = JSON.parse(errorResponseStr);
          return res.status(error.response.status).send(errorResponseJson);
        } else {
          if (DEBUG)
            console.error("Could not JSON parse stream message", error);
          return res.status(500).send({
            status: false,
            error: "something went wrong!",
          });
        }
      } catch (e) {
        console.log(e);
        return res.status(500).send({
          status: false,
          error: "something went wrong!",
        });
      }
    }
  } else {
    try {
      const response = await axios.post(
        `https://api.openai.com/v1/completions`,
        req.body,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
        }
      );

      delete response.data.id;
      delete response.data.created;

      return res.status(200).send(response.data);
    } catch (error) {
      try {
        error.response.data.error.message =
          error.response.data.error.message.replace(/org-[a-zA-Z0-9]+/, orgId);
        return res.status(error.response.status).send(error.response.data);
      } catch (e) {
        if (DEBUG) console.log(e);
        return res.status(500).send({
          status: false,
          error: "something went wrong!",
        });
      }
    }
  }
}

async function chatCompletions(req, res) {
  let orgId = generateId();
  let key = getOpenAIKey();

  if (MODERATION) {
    try {
      let prompt = [];
      try {
        req.body.messages.forEach((element) => {
          prompt.push(element.content);
        });
      } catch (e) {
        return res.status(400).send({
          status: false,
          error:
            "messages is required! and must be an array of objects with content and author properties",
        });
      }

      if (DEBUG)
        console.log(
          `[CHAT] [${req.user.data.id}] [${req.user.data.name}] [MAX-TOKENS:${
            req.body.max_tokens ?? "unset"
          }] ${prompt}`
        );

      let openAi = new OpenAIApi(new Configuration({ apiKey: key }));
      let response = await openAi.createModeration({
        input: prompt,
      });

      if (response.data.results[0].flagged) {
        res.set("Content-Type", "application/json");
        return res.status(400).send({
          status: false,
          error: "Your prompt contains content that is not allowed",
          reason: response.data.results[0].reason,
          support: "https://discord.pawan.krd",
        });
      }
    } catch (e) {
      if (DEBUG) console.log(e);
      return res.status(500).send({
        status: false,
        error: "something went wrong!",
      });
    }
  } else {
    if (DEBUG)
      console.log(
        `[CHAT] [${req.user.data.id}] [${req.user.data.name}] [MAX-TOKENS:${
          req.body.max_tokens ?? "unset"
        }]`
      );
  }

  if (req.body.stream) {
    try {
      const response = await axios.post(
        `https://api.openai.com/v1/chat/completions`,
        req.body,
        {
          responseType: "stream",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
        }
      );

      res.setHeader("content-type", "text/event-stream");

      for await (const message of streamCompletion(response.data)) {
        try {
          const parsed = JSON.parse(message);
          delete parsed.id;
          delete parsed.created;
          const { content } = parsed.choices[0].delta;
          if (content) {
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          }
        } catch (error) {
          if (DEBUG)
            console.error(
              "Could not JSON parse stream message",
              message,
              error
            );
        }
      }

      res.write(`data: [DONE]`);
      res.end();
    } catch (error) {
      try {
        if (error.response && error.response.data) {
          let errorResponseStr = "";

          for await (const message of error.response.data) {
            errorResponseStr += message;
          }

          errorResponseStr = errorResponseStr.replace(
            /org-[a-zA-Z0-9]+/,
            orgId
          );

          const errorResponseJson = JSON.parse(errorResponseStr);
          return res.status(error.response.status).send(errorResponseJson);
        } else {
          if (DEBUG)
            console.error("Could not JSON parse stream message", error);
          return res.status(500).send({
            status: false,
            error: "something went wrong!",
          });
        }
      } catch (e) {
        if (DEBUG) console.log(e);
        return res.status(500).send({
          status: false,
          error: "something went wrong!",
        });
      }
    }
  } else {
    try {
      const response = await axios.post(
        `https://api.openai.com/v1/chat/completions`,
        req.body,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
        }
      );

      delete response.data.id;
      delete response.data.created;

      return res.status(200).send(response.data);
    } catch (error) {
      try {
        error.response.data.error.message =
          error.response.data.error.message.replace(/org-[a-zA-Z0-9]+/, orgId);
        return res.status(error.response.status).send(error.response.data);
      } catch (e) {
        if (DEBUG) console.log(e);
        return res.status(500).send({
          status: false,
          error: "something went wrong!",
        });
      }
    }
  }
}

async function getPoeClient(token, useCache = false) {
  let client;
  if (useCache && poeClientCache[token]) {
    client = poeClientCache[token];
  } else {
    client = new poe.Client(true, useCache);
    await client.init(token);
  }
  return client;
}

async function poe2Completions(request, response) {
  console.log("body logger");
  //start get token
  let key = getPoeKey();
  const token = key;
  if (!token) {
    return response.sendStatus(401);
  }
  //end get token

  let maxtoken = request.body.max_tokens;
  const bot = "capybara";

  //start generating client
  let client;
  const count = request.body.count ?? -1;
  try {
    client = await getPoeClient(token, true);
    await client.purge_conversation(bot, count);
  } catch (error) {
    console.error(error.message);

    return response.status(500).send({
      status: false,
      error: {
        message: `"${key}" is invalid poe cookie, Please recheck your cookie`,
        type: "invalid_request_error",
      },
      hint: "",
      info: "https://discord.com/channels/563783473115168788/1129375417673977867",
    });
  }
  //end generating client

  const streaming = false;

  request.body = {
    bot,
    streaming,
    prompt: await convertOAItoPOE(bot, request.body.messages, client),
  };

  if (!request.body.prompt) {
    return response.sendStatus(400);
  }

  const prompt = request.body.prompt;

  if (streaming) {
    try {
      response.write("streaming is not supported");
    } catch (err) {
      console.error(err);
    } finally {
      //client.disconnect_ws();
      response.end();
    }
  } else {
    try {
      let reply;
      let messageId;
      // console.log(prompt)
      for await (const mes of client.send_message(bot, prompt, false, 60)) {
        reply = mes.text;
        messageId = mes.messageId;
      }
      // console.log('reply on')
      // console.log(reply);
      let replyasOAI = await convertPOEtoOAI(reply, maxtoken);
      console.log("reply sent");
      // console.log(replyasOAI)
      //client.disconnect_ws();
      // response.set('X-Message-Id', String(messageId));
      return response.status(200).send(replyasOAI);
    } catch (error) {
      //client.disconnect_ws();
      console.log(error);
      return response.send("ded");
    }
  }
}

async function chatgptCompletion(request, response) {
  console.log("body logger");
  //start get token
  let key = getPoeKey();
  const token = key;
  if (!token) {
    return response.sendStatus(401);
  }
  //end get token

  let maxtoken = request.body.max_tokens;
  const bot = "chinchilla";

  //start generating client
  let client;
  const count = request.body.count ?? -1;
  try {
    client = await getPoeClient(token, true);
    await client.purge_conversation(bot, count);
  } catch (error) {
    return response.status(500).send({
      status: false,
      error: {
        message: `"${key}" is invalid poe cookie, Please recheck your cookie`,
        type: "invalid_request_error",
      },
      hint: "",
      info: "https://discord.com/channels/563783473115168788/1129375417673977867",
    });
  }
  //end generating client

  const streaming = false;

  request.body = {
    bot,
    streaming,
    prompt: await convertOAItoPOE(bot, request.body.messages, client),
  };

  if (!request.body.prompt) {
    return response.sendStatus(400);
  }

  const prompt = request.body.prompt;

  if (streaming) {
    try {
      response.write("streaming is not supported");
    } catch (err) {
      console.error(err);
    } finally {
      //client.disconnect_ws();
      response.end();
    }
  } else {
    try {
      let reply;
      let messageId;
      // console.log(prompt)
      for await (const mes of client.send_message(bot, prompt, false, 60)) {
        reply = mes.text;
        messageId = mes.messageId;
      }
      // console.log('reply on')
      // console.log(reply);
      let replyasOAI = await convertPOEtoOAI(reply, maxtoken);
      console.log("reply sent");
      // console.log(replyasOAI)
      //client.disconnect_ws();
      // response.set('X-Message-Id', String(messageId));
      return response.status(200).send(replyasOAI);
    } catch {
      //client.disconnect_ws();
      return response.status(500).send({
        status: false,
        error: {
          message: "Too long context, please lower context size",
          type: "invalid_request_error",
        },
        hint: "",
        info: "https://discord.com/channels/563783473115168788/1129375417673977867",
      });
    }
  }
}

async function gpt4Completion(request, response) {
  console.log("body logger");
  //start get token
  let key = getPoeKey();
  const token = key;
  if (!token) {
    return response.sendStatus(401);
  }
  //end get token

  let maxtoken = request.body.max_tokens;
  const bot = "beaver";

  //start generating client
  let client;
  const count = request.body.count ?? -1;
  try {
    client = await getPoeClient(token, true);
    await client.purge_conversation(bot, count);
  } catch (error) {
    return response.status(500).send({
      status: false,
      error: {
        message: `"${key}" is invalid poe cookie, Please recheck your cookie`,
        type: "invalid_request_error",
      },
      hint: "",
      info: "https://discord.com/channels/563783473115168788/1129375417673977867",
    });
  }
  //end generating client

  const streaming = false;

  request.body = {
    bot,
    streaming,
    prompt: await convertOAItoPOE(bot, request.body.messages, client),
  };

  if (!request.body.prompt) {
    return response.sendStatus(400);
  }

  const prompt = request.body.prompt;

  if (streaming) {
    try {
      response.write("streaming is not supported");
    } catch (err) {
      console.error(err);
    } finally {
      //client.disconnect_ws();
      response.end();
    }
  } else {
    try {
      let reply;
      let messageId;
      // console.log(prompt)
      for await (const mes of client.send_message(bot, prompt, false, 60)) {
        reply = mes.text;
        messageId = mes.messageId;
      }
      // console.log('reply on')
      // console.log(reply);
      let replyasOAI = await convertPOEtoOAI(reply, maxtoken);
      console.log("reply sent");
      // console.log(replyasOAI)
      //client.disconnect_ws();
      // response.set('X-Message-Id', String(messageId));
      return response.status(200).send(replyasOAI);
    } catch {
      //client.disconnect_ws();
      return response.status(500).send({
        status: false,
        error: {
          message: "Too long context, please lower context size",
          type: "invalid_request_error",
        },
        hint: "",
        info: "https://discord.com/channels/563783473115168788/1129375417673977867",
      });
    }
  }
}

async function claudeInstantCompletion(request, response) {
  console.log("body logger");
  //start get token
  let key = getPoeKey();
  const token = key;
  if (!token) {
    return response.sendStatus(401);
  }
  //end get token

  let maxtoken = request.body.max_tokens;
  const bot = "a2";

  //start generating client
  let client;
  const count = request.body.count ?? -1;
  try {
    client = await getPoeClient(token, true);
    await client.purge_conversation(bot, count);
  } catch (error) {
    return response.status(500).send({
      status: false,
      error: {
        message: `"${key}" is invalid poe cookie, Please recheck your cookie`,
        type: "invalid_request_error",
      },
      hint: "",
      info: "https://discord.com/channels/563783473115168788/1129375417673977867",
    });
  }
  //end generating client

  const streaming = false;

  request.body = {
    bot,
    streaming,
    prompt: await convertOAItoPOE(bot, request.body.messages, client),
  };

  if (!request.body.prompt) {
    return response.sendStatus(400);
  }

  const prompt = request.body.prompt;

  if (streaming) {
    try {
      response.write("streaming is not supported");
    } catch (err) {
      console.error(err);
    } finally {
      //client.disconnect_ws();
      response.end();
    }
  } else {
    try {
      let reply;
      let messageId;
      // console.log(prompt)
      for await (const mes of client.send_message(bot, prompt, false, 60)) {
        reply = mes.text;
        messageId = mes.messageId;
      }
      // console.log('reply on')
      // console.log(reply);
      let replyasOAI = await convertPOEtoOAI(reply, maxtoken);
      console.log("reply sent");
      // console.log(replyasOAI)
      //client.disconnect_ws();
      // response.set('X-Message-Id', String(messageId));
      return response.status(200).send(replyasOAI);
    } catch {
      //client.disconnect_ws();
      return response.status(500).send({
        status: false,
        error: {
          message: "Too long context, please lower context size",
          type: "invalid_request_error",
        },
        hint: "",
        info: "https://discord.com/channels/563783473115168788/1129375417673977867",
      });
    }
  }
}

async function claude2Completion(request, response) {
  console.log("body logger");
  //start get token
  let key = getPoeKey();
  const token = key;
  if (!token) {
    return response.sendStatus(401);
  }
  //end get token

  let maxtoken = request.body.max_tokens;
  const bot = "a2_2";

  //start generating client
  let client;
  const count = request.body.count ?? -1;
  try {
    client = await getPoeClient(token, true);
    await client.purge_conversation(bot, count);
  } catch (error) {
    return response.status(500).send({
      status: false,
      error: {
        message: `"${key}" is invalid poe cookie, Please recheck your cookie`,
        type: "invalid_request_error",
      },
      hint: "",
      info: "https://discord.com/channels/563783473115168788/1129375417673977867",
    });
  }
  //end generating client

  const streaming = false;

  request.body = {
    bot,
    streaming,
    prompt: await convertOAItoPOE(bot, request.body.messages, client),
  };

  if (!request.body.prompt) {
    return response.sendStatus(400);
  }

  const prompt = request.body.prompt;

  if (streaming) {
    try {
      response.write("streaming is not supported");
    } catch (err) {
      console.error(err);
    } finally {
      //client.disconnect_ws();
      response.end();
    }
  } else {
    try {
      let reply;
      let messageId;
      // console.log(prompt)
      for await (const mes of client.send_message(bot, prompt, false, 60)) {
        reply = mes.text;
        messageId = mes.messageId;
      }
      // console.log('reply on')
      // console.log(reply);
      let replyasOAI = await convertPOEtoOAI(reply, maxtoken);
      console.log("reply sent");
      // console.log(replyasOAI)
      //client.disconnect_ws();
      // response.set('X-Message-Id', String(messageId));
      return response.status(200).send(replyasOAI);
    } catch {
      //client.disconnect_ws();
      return response.status(500).send({
        status: false,
        error: {
          message: "Too long context, please lower context size",
          type: "invalid_request_error",
        },
        hint: "",
        info: "https://discord.com/channels/563783473115168788/1129375417673977867",
      });
    }
  }
}

export {
  completions,
  chatCompletions,
  poe2Completions,
  chatgptCompletion,
  gpt4Completion,
  claudeInstantCompletion,
  claude2Completion,
, promptlogger};
