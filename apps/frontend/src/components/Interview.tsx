import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, PhoneOff, User } from "lucide-react";
import { Button } from "./ui/button";
import { VoiceOrb } from "./VoiceOrb";

type Status = "connecting" | "live" | "ending";

/** Attaches an analyser to a stream and returns a getter for its current 0..1 volume level. */
function createLevelMeter(ctx: AudioContext, stream: MediaStream) {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    return () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Boost and clamp so normal speech fills most of the range.
        return Math.min(1, rms * 3.2);
    };
}

/** Attaches an analyser to an Audio element and returns a getter for its current 0..1 volume level. */
function createAudioElementLevelMeter(ctx: AudioContext, audioEl: HTMLAudioElement) {
    const source = ctx.createMediaElementSource(audioEl);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.fftSize);

    return () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Boost and clamp so normal speech fills most of the range.
        return Math.min(1, rms * 3.2);
    };
}

export function Interview() {
    const { interviewId } = useParams();
    const navigate = useNavigate();

    const [status, setStatus] = useState<Status>("connecting");
    const [aiLevel, setAiLevel] = useState(0);
    const [userLevel, setUserLevel] = useState(0);
    const [error, setError] = useState<string | null>(null);


    // Resources we need to tear down on exit.
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const userStreamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        let recognition: any = null;
        let aiAudioEl: HTMLAudioElement | null = null;
        const localSpeechSynthesis = window.speechSynthesis;

        (async () => {
            try {
                // Check if backend config has OpenAI key
                const statusRes = await axios.get(`${BACKEND_URL}/api/v1/config/status`);
                const { hasOpenAI } = statusRes.data;

                // Stream to Deepgram for user transcript if key exists
                let deepgramKey = "";
                try {
                    const configRes = await axios.get(`${BACKEND_URL}/api/v1/config/deepgram`);
                    deepgramKey = configRes.data?.key || "";
                } catch (err) {
                    console.warn("Failed to fetch Deepgram config:", err);
                }

                // Capture microphone for both modes (for voice levels / speech recognition)
                const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (cancelled) {
                    ms.getTracks().forEach((t) => t.stop());
                    return;
                }
                userStreamRef.current = ms;

                const audioCtx = new AudioContext();
                audioCtxRef.current = audioCtx;
                const userMeter = createLevelMeter(audioCtx, ms);

                if (hasOpenAI) {
                    // --- MODE A: OpenAI WebRTC Realtime API ---
                    const pc = new RTCPeerConnection();
                    pcRef.current = pc;
                    let aiMeter: (() => number) | null = null;

                    const audioEl = document.createElement("audio");
                    audioEl.autoplay = true;
                    pc.ontrack = (e) => {
                        const stream = e.streams[0]!;
                        audioEl.srcObject = stream;
                        aiMeter = createLevelMeter(audioCtx, stream);
                    };

                    if (deepgramKey) {
                        const socket = new WebSocket("wss://api.deepgram.com/v1/listen", ["token", deepgramKey]);
                        socketRef.current = socket;
                        socket.onopen = () => {
                            const mediaRecorder = new MediaRecorder(ms, { mimeType: "audio/webm" });
                            recorderRef.current = mediaRecorder;
                            mediaRecorder.start(250);
                            mediaRecorder.addEventListener("dataavailable", (event) => {
                                if (socket.readyState === WebSocket.OPEN) socket.send(event.data);
                            });
                        };
                        socket.onmessage = (message) => {
                            const received = JSON.parse(message.data);
                            const transcript = received.channel?.alternatives[0]?.transcript;
                            if (transcript) {
                                axios.post(`${BACKEND_URL}/api/v1/session/user/response/${interviewId}`, { message: transcript });
                            }
                        };
                    }

                    pc.addTrack(ms.getTracks()[0]!);

                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    const sdpResponse = await fetch(`${BACKEND_URL}/api/v1/session/${interviewId}`, {
                        method: "POST",
                        body: offer.sdp,
                        headers: { "Content-Type": "application/sdp" },
                    });
                    if (!sdpResponse.ok) {
                        const errorText = await sdpResponse.text();
                        throw new Error(errorText || `Failed to establish SDP session: ${sdpResponse.status}`);
                    }
                    const answer = { type: "answer" as const, sdp: await sdpResponse.text() };
                    await pc.setRemoteDescription(answer);

                    if (cancelled) return;
                    setStatus("live");

                    const tick = () => {
                        if (aiMeter) setAiLevel(aiMeter());
                        setUserLevel(userMeter());
                        rafRef.current = requestAnimationFrame(tick);
                    };
                    rafRef.current = requestAnimationFrame(tick);

                } else {
                    // --- MODE B: Deepgram High-Fidelity Local Voice Fallback (Zero OpenAI Key) ---
                    if (cancelled) return;
                    setStatus("live");

                    aiAudioEl = document.createElement("audio");
                    aiAudioEl.crossOrigin = "anonymous";
                    const aiMeter = createAudioElementLevelMeter(audioCtx, aiAudioEl);

                    const tick = () => {
                        setAiLevel(aiMeter());
                        setUserLevel(userMeter());
                        rafRef.current = requestAnimationFrame(tick);
                    };
                    rafRef.current = requestAnimationFrame(tick);

                    // Local loop function for interview conversation turns
                    const runLocalInterviewTurn = async () => {
                        if (cancelled) return;
                        try {
                            // Fetch the next question from Gemini/Groq
                            const res = await axios.get(`${BACKEND_URL}/api/v1/session/local/chat/${interviewId}`);
                            const questionText = res.data.question;
                            if (!questionText || cancelled) return;

                            aiAudioEl!.src = `${BACKEND_URL}/api/v1/session/speak?text=${encodeURIComponent(questionText)}`;

                            aiAudioEl!.onended = () => {
                                startListening();
                            };

                            aiAudioEl!.onerror = (e) => {
                                console.error("Audio playback error, falling back to listening:", e);
                                startListening();
                            };

                            await audioCtx.resume();

                            await aiAudioEl!.play();
                        } catch (err: any) {
                            console.error("Local speech turn error:", err);
                        }
                    };

                    const startListening = () => {
                        if (cancelled) return;

                        // Ensure we cleanup any previous sockets/recorders
                        if (recorderRef.current && recorderRef.current.state !== "inactive") {
                            try { recorderRef.current.stop(); } catch {}
                        }
                        if (socketRef.current) {
                            try { socketRef.current.close(); } catch {}
                        }

                        let accumulatedTranscript = "";
                        let silenceTimer: any = null;

                        const finalizeTurn = async () => {
                            if (silenceTimer) clearTimeout(silenceTimer);

                            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                                try { recorderRef.current.stop(); } catch {}
                            }
                            if (socketRef.current) {
                                try { socketRef.current.close(); } catch {}
                            }

                            const trimmed = accumulatedTranscript.trim();
                            if (trimmed !== "") {
                                try {
                                    await axios.post(`${BACKEND_URL}/api/v1/session/local/respond/${interviewId}`, {
                                        message: trimmed
                                    });
                                    runLocalInterviewTurn();
                                } catch (err) {
                                    console.error("Failed to save local speech response:", err);
                                    runLocalInterviewTurn();
                                }
                            } else {
                                startListening();
                            }
                        };

                        if (!deepgramKey) {
                            console.error("Deepgram key is not available for transcription fallback.");
                            return;
                        }

                        const socket = new WebSocket("wss://api.deepgram.com/v1/listen", ["token", deepgramKey]);
                        socketRef.current = socket;

                        socket.onopen = () => {
                            if (cancelled) return;
                            const mediaRecorder = new MediaRecorder(ms, { mimeType: "audio/webm" });
                            recorderRef.current = mediaRecorder;
                            mediaRecorder.start(250);
                            mediaRecorder.addEventListener("dataavailable", (event) => {
                                if (socket.readyState === WebSocket.OPEN) {
                                    socket.send(event.data);
                                }
                            });
                        };

                        socket.onmessage = (message) => {
                            if (cancelled) return;
                            const received = JSON.parse(message.data);
                            const transcript = received.channel?.alternatives[0]?.transcript;
                            if (transcript && transcript.trim() !== "") {
                                accumulatedTranscript += " " + transcript;

                                if (silenceTimer) clearTimeout(silenceTimer);
                                silenceTimer = setTimeout(() => {
                                    finalizeTurn();
                                }, 2000);
                            }
                        };

                        socket.onerror = (err) => {
                            console.error("Deepgram WebSocket error:", err);
                        };
                    };

                    // Kickoff first question
                    runLocalInterviewTurn();
                }

            } catch (err: any) {
                console.error("Failed to start session:", err);
                if (!cancelled) {
                    setError(err.message || String(err));
                }
            }
        })();

        return () => {
            cancelled = true;
            if (recognition) {
                try { recognition.abort(); } catch {}
            }
            localSpeechSynthesis.cancel();
            if (aiAudioEl) {
                try { aiAudioEl.pause(); } catch {}
            }
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId]);

    function cleanup() {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
        socketRef.current?.close();
        userStreamRef.current?.getTracks().forEach((t) => t.stop());
        pcRef.current?.getSenders().forEach((s) => s.track?.stop());
        pcRef.current?.close();
        audioCtxRef.current?.close().catch(() => {});
    }

    function endInterview() {
        setStatus("ending");
        cleanup();
        navigate(`/result/${interviewId}`);
    }

    const aiSpeaking = aiLevel > 0.06 && aiLevel >= userLevel;
    const userSpeaking = userLevel > 0.06 && userLevel > aiLevel;

    return (
        <main className="flex h-screen w-screen flex-col overflow-hidden">
            <header className="flex items-center justify-between px-6 py-5">
                <div className="flex items-center gap-4 text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <span className="relative flex size-2.5">
                            <span
                                className={
                                    status === "live"
                                        ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
                                        : "hidden"
                                }
                            />
                            <span
                                className={
                                    "relative inline-flex size-2.5 rounded-full " +
                                    (status === "live" ? "bg-emerald-400" : "bg-amber-400")
                                }
                            />
                        </span>
                        {status === "connecting" ? "Connecting…" : status === "ending" ? "Wrapping up…" : "Interview live"}
                    </div>

                </div>
                <span className="text-sm text-muted-foreground">SignalForge</span>
            </header>

            {/* Stage */}
            <div className="flex flex-1 items-center justify-center px-6">
                {error ? (
                    <div className="flex flex-col items-center gap-4 text-center max-w-lg p-6 bg-red-950/20 border border-red-500/30 rounded-2xl">
                        <p className="text-red-400 font-semibold text-lg">Failed to Initialize Interview</p>
                        <p className="text-sm text-muted-foreground max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">{error}</p>
                        <Button onClick={() => navigate("/")} variant="outline" className="mt-2 rounded-full">
                            Back to Setup
                        </Button>
                    </div>
                ) : status === "connecting" ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="size-7 animate-spin" />
                        <p className="text-sm">Setting up your interview & microphone…</p>
                    </div>
                ) : (
                    <div className="flex w-full max-w-3xl items-center justify-center gap-12 sm:gap-24">
                        <VoiceOrb
                            level={aiLevel}
                            speaking={aiSpeaking}
                            label="Interviewer"
                            sublabel="Listening"
                            icon={Bot}
                            accent="violet"
                        />
                        <VoiceOrb
                            level={userLevel}
                            speaking={userSpeaking}
                            label="You"
                            sublabel="Mic on"
                            icon={User}
                            accent="emerald"
                        />
                    </div>
                )}
            </div>

            {/* Controls */}
            <footer className="flex justify-center px-6 py-8">
                <Button
                    variant="destructive"
                    size="lg"
                    onClick={endInterview}
                    disabled={status === "ending"}
                    className="gap-2 rounded-full px-6"
                >
                    {status === "ending" ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <PhoneOff className="size-4" />
                    )}
                    End interview
                </Button>
            </footer>
        </main>
    );
}
