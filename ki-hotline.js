import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import WebSocket from 'ws';
import dotenv from 'dotenv';

// Lese Umgebungsvariablen aus einer .env-Datei
dotenv.config();

const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
    console.error('Fehlende Umgebungsvariable. Bitte definieren Sie diese in einer .env-Datei.');
    process.exit(1);
}

// Initisalisiere Fastify-Server
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

fastify.all('/incoming-call', async (request, reply) => {
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                          <Say language="de-De">Viel Spaß beim Testen des Sprachassistenten!</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream"/>
                              </Connect>
                          </Response>`;

    reply.type('text/xml').send(twimlResponse);
});

// WebSocket route für die Websocket-Verbindung zwischen Twilio und OpenAI
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (twilioWs, req) => {
        console.log('Anrufer verbunden');

        // Zustandsvariablen
        let streamSid = null, lastAssistantItem = null,
            responseStartTimestampTwilio = null,
            latestMediaTimestamp = 0, markQueue = [];

        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        openAiWs.on('open', initialisiereOpenAiSession);
        openAiWs.on('message', verarbeiteOpenAiNachrichten);
        openAiWs.on('close', () => {
            console.log('Disconnected from the OpenAI Realtime API');
        });
        openAiWs.on('error', (error) => {
            console.error('Error in the OpenAI WebSocket:', error);
        });
        twilioWs.on('message', verarbeiteAnruferNachrichten);
        twilioWs.on('close', () => {
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
            console.log('Client disconnected.');
        });


        const initialisiereOpenAiSession = () => {
            console.log('Verbunden mit der OpenAI Realtime API');
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: "alloy",
                    instructions: "Du bist ein hilfsbereiter Sprachassistent, der Fragen kurz und bündig beantwortet ohne viel zu reden.",
                    modalities: ["text", "audio"],
                    temperature: 0.6,
                    tools: [
                        {
                            "name": "bewerte_reise_preis",
                            "description": "Falls der nach dem Preis der Reise fragt, nutze diese Funktion um den Preis zu berechnen.",
                            "type": "function",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "start": {
                                        "type": "string",
                                        "description": "Ort von dem die Reise startet"
                                    },
                                    "ziel": {
                                        "type": "string",
                                        "description": "Ort an dem die Reise endet"
                                    },
                                    "verkehrsmittel": {
                                        "type": "string",
                                        "description": "Verkehrsmittel für die Reise"
                                    },
                                    "dauer": {
                                        "type": "integer",
                                        "description": "Dauer der Reise in Minuten"
                                    }
                                },
                                "additionalProperties": false,
                                "required": [
                                    "start",
                                    "ziel",
                                    "verkehrsmittel",
                                    "dauer",
                                ]
                            }
                        }
                    ],
                },
            };
            const initialConversationItem = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: 'Hallo'
                        }
                    ]
                }
            };


            // Initialisiere die Sitzung mit OpenAI
            openAiWs.send(JSON.stringify(sessionUpdate));
            // Sende das erste Konversations-Element an OpenAI
            openAiWs.send(JSON.stringify(initialConversationItem));
            // Lass die KI als erstes antworten
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
        };

        const verarbeiteAnruferNachrichten = (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case 'media':
                        latestMediaTimestamp = data.media.timestamp;
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload
                            };
                            openAiWs.send(JSON.stringify(audioAppend));
                        }
                        break;
                    case 'start':
                        streamSid = data.start.streamSid;
                        console.log('Beginn des Anruferstreams', streamSid);

                        // Zurücksetzen der Zustandsvariablen
                        responseStartTimestampTwilio = null;
                        latestMediaTimestamp = 0;
                        break;
                    case 'mark':
                        if (markQueue.length > 0) {
                            markQueue.shift();
                        }
                        break;
                    default:
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error, 'Message:', message);
            }
        };

        // Liste der Ereignistypen, die protokolliert werden sollen. Vergleiche mit der OpenAI-Dokumentation https://platform.openai.com/docs/api-reference/realtime
        const LOG_EVENT_TYPES = [
            'error',
            "conversation.item.created",
            "response.function_call_arguments.done",
        ];
        const verarbeiteOpenAiNachrichten = (data) => {
            try {
                const response = JSON.parse(data);

                if (LOG_EVENT_TYPES.includes(response.type)) {
                    console.log(`Received event: ${response.type}`, response);
                }

                // Leite das Audio-Delta von OpenAI an Twilio weiter
                if (response.type === 'response.audio.delta' && response.delta) {
                    const audioDelta = {
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: response.delta }
                    };
                    twilioWs.send(JSON.stringify(audioDelta));

                    // Markiere den aktuellen Zeitpunkt im Stream damit wir wissen, wann die Antwort abgeschnitten werden soll
                    if (!responseStartTimestampTwilio) {
                        responseStartTimestampTwilio = latestMediaTimestamp;
                    }
                    if (response.item_id) {
                        lastAssistantItem = response.item_id;
                    }
                    if (streamSid) {
                        const markEvent = {
                            event: 'mark',
                            streamSid: streamSid,
                            mark: { name: 'responsePart' }
                        };
                        twilioWs.send(JSON.stringify(markEvent));
                        markQueue.push('responsePart');
                    }
                }

                // Wenn die Spracherkennung von OpenAI beginnt, dann schneide die vorherige Antwort ab
                if (response.type === 'input_audio_buffer.speech_started') {
                    if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
                        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;

                        if (lastAssistantItem) {
                            const truncateEvent = {
                                type: 'conversation.item.truncate',
                                item_id: lastAssistantItem,
                                content_index: 0,
                                audio_end_ms: elapsedTime
                            };
                            openAiWs.send(JSON.stringify(truncateEvent));
                        }

                        twilioWs.send(JSON.stringify({
                            event: 'clear',
                            streamSid: streamSid
                        }));

                        // Reset
                        markQueue = [];
                        lastAssistantItem = null;
                        responseStartTimestampTwilio = null;
                    }
                }

                if (response.type === 'response.function_call_arguments.done') {
                    const { start, ziel, verkehrsmittel, dauer } = JSON.parse(response.arguments);

                    const preis = Math.round(Math.random() * 10 * dauer);

                    console.log(`Der zufällige Preis für die Reise von ${start} nach ${ziel} mit ${verkehrsmittel} beträgt ${preis}€`);

                    openAiWs.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id: response.call_id,
                            output: JSON.stringify({ preis }),
                        }
                    }));
                    // Damit die KI weiter antwortet
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                }

            } catch (error) {
                console.error('Fehlermeldung der OpenAI Realtime API:', error, 'Raw message:', data);
            }
        };

    });
});


fastify.listen({ port: 3000 }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server started`);
});