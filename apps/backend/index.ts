import express from "express";
import { PreInterviewBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { prisma } from "./db";
import { initSideband } from "./sideband";
import { calculateResult, generateText } from "./result";

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

app.get("/api/v1/config/deepgram", (req, res) => {
    res.json({ key: process.env.DEEPGRAM_API_KEY || "" });
});

app.get("/api/v1/config/status", (req, res) => {
    res.json({
        hasOpenAI: !!process.env.OPENAI_KEY && process.env.OPENAI_KEY.trim() !== "",
        hasGemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "",
        hasDeepgram: !!process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY.trim() !== ""
    });
});

app.get("/api/v1/session/speak", async (req, res) => {
    const text = req.query.text as string;
    if (!text || text.trim() === "") {
        res.status(400).json({ error: "Text query parameter is required." });
        return;
    }

    try {
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (!deepgramKey) {
            res.status(500).json({ error: "DEEPGRAM_API_KEY is not configured on the server." });
            return;
        }

        const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
            method: "POST",
            headers: {
                "Authorization": `Token ${deepgramKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Deepgram TTS error:", response.status, errText);
            res.status(response.status).json({ error: `Deepgram TTS error: ${errText}` });
            return;
        }

        const contentType = response.headers.get("content-type") || "audio/mpeg";
        res.setHeader("Content-Type", contentType);

        const reader = response.body?.getReader();
        if (!reader) {
            res.status(500).json({ error: "Could not read audio stream from Deepgram" });
            return;
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    } catch (error: any) {
        console.error("Error in speak endpoint:", error);
        res.status(500).json({ error: error.message || "Failed to stream audio from Deepgram" });
    }
});

app.get("/api/v1/session/local/chat/:interviewId", async (req, res) => {
    const { interviewId } = req.params;
    try {
        const interview = await prisma.interview.findFirst({
            where: { id: interviewId },
            include: { conversations: { orderBy: { createdAt: "asc" } } }
        });

        if (!interview) {
            res.status(404).json({ error: "Interview session not found." });
            return;
        }

        const { candidateName, targetRole, resumeText, githubMetadata, createdAt } = interview;

        const conversationHistory = interview.conversations.map(msg => 
            `${msg.type === "User" ? "Candidate" : "Interviewer"}: ${msg.message}`
        ).join("\n");

        let prompt = `You are a senior technical interviewer conducting a friendly but rigorous job interview.
Candidate Name: ${candidateName || "Candidate"}
Target Role / Job Description: ${targetRole || "Software Developer"}

`;

        if (githubMetadata) {
            const parsedGithub = typeof githubMetadata === "string" 
                ? JSON.parse(githubMetadata) 
                : githubMetadata;
            prompt += `Candidate's GitHub repositories and star counts:
${JSON.stringify(parsedGithub, null, 2)}\n\n`;
        }

        if (resumeText) {
            prompt += `Candidate's Resume/Background details:
${resumeText}\n\n`;
        }

        // Calculate elapsed time (20 minutes limit)
        const elapsedMinutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
        const isTimeNearlyUp = elapsedMinutes >= 18; // 18 minutes elapsed means 2 minutes left

        if (conversationHistory.trim() === "") {
            prompt += `This is the beginning of the interview. Please greet the candidate (${candidateName || "Candidate"}) by name, introduce yourself, and ask the first question.
Focus the question on their background, target role, or a project from their GitHub/resume.
Keep your response short (1-2 sentences max) and conversational so it sounds natural when spoken aloud.`;
        } else {
            prompt += `Here is the conversation transcript so far:
${conversationHistory}

`;
            if (isTimeNearlyUp) {
                prompt += `[SYSTEM NOTICE: The 20-minute interview time limit is almost up. Please politely inform ${candidateName || "the candidate"} that we are wrapping up, make a brief friendly closing statement, thank them for their time, and DO NOT ask any more questions.]`;
            } else {
                prompt += `Based on the conversation, ask the next logical follow-up question or dive deeper into their previous technical statement.
If you feel the interview is complete (e.g., after 5-7 questions and answers, or if they wrap up), make a brief, friendly closing statement, thank them, and do not ask any more questions.
Keep your response brief (1-2 sentences max) and conversational so it sounds natural when spoken. Do not add formatting like quotes or titles.`;
            }
        }

        // Call Gemini/Groq to generate the next response
        const result = await generateText(prompt);

        // Save the assistant's message to the database
        const savedMessage = await prisma.message.create({
            data: {
                interviewId,
                type: "Assistant",
                message: result
            }
        });

        res.json({ question: savedMessage.message });
    } catch (err: any) {
        console.error("Local session error:", err);
        res.status(500).json({ error: err.message || "Failed to generate interviewer question" });
    }
});

app.post("/api/v1/session/local/respond/:interviewId", async (req, res) => {
    const { interviewId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
        res.status(400).json({ error: "Message content is required." });
        return;
    }

    try {
        await prisma.message.create({
            data: {
                interviewId,
                type: "User",
                message
            }
        });
        res.json({ status: "saved" });
    } catch (err: any) {
        console.error("Failed to save response:", err);
        res.status(500).json({ error: err.message || "Failed to save response" });
    }
});

app.post("/api/v1/pre-interview", async (req, res) => { 
    const { success, data } = PreInterviewBody.safeParse(req.body);

    if (!success) {
        res.status(411).json({
            message: "Incorrect body"
        });
        return;
    }

    let githubData = null;
    let githubUrl = null;

    if (data.type === "github" && data.github) {
        try {
            githubUrl = data.github.endsWith("/") ? data.github.slice(0, -1) : data.github;
            const githubUsername = githubUrl.split("/").pop()!;
            githubData = await scrapeGithub(githubUsername);
        } catch (e) {
            console.error("Failed to scrape GitHub username:", e);
            githubData = { username: "", repositories: [] };
        }
    }

    const interview = await prisma.interview.create({
        data: {
            candidateName: data.candidateName,
            targetRole: data.targetRole,
            resumeText: data.type === "resume" ? data.resumeText : null,
            githubUrl: data.type === "github" ? githubUrl : null,
            githubMetadata: githubData ? JSON.stringify(githubData) : null,
            status: "Pre"
        }
    });

    res.json({ id: interview.id });
});

app.post("/api/v1/session/:interviewId", async (req, res) => {
    
    const sessionConfig = JSON.stringify({
        type: "realtime",
        model: "gpt-realtime",
        audio: { output: { voice: "marin" } },
    });

    const fd = new FormData();
    fd.set("sdp", req.body);
    fd.set("session", sessionConfig);
  
    try {
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
          "OpenAI-Safety-Identifier": "hashed-user-id",
        },
        body: fd,
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error("OpenAI API call failed with status", sdpResponse.status, errorText);
        res.status(sdpResponse.status).send(`OpenAI API Error: ${errorText}`);
        return;
      }

      const location = sdpResponse.headers.get("Location");
      const callId = location?.split("/").pop()!;
      console.log("Session Call ID:", callId);
      // Send back the SDP we received from the OpenAI REST API
      const sdp = await sdpResponse.text();
      res.send(sdp);

      initSideband(callId, req.params.interviewId);
    } catch (error) {
      console.error("Token generation error:", error);
      res.status(500).send("Failed to generate session token due to an internal server error.");
    }

});

app.post("/api/v1/session/user/response/:interviewId", async (req, res) => {
  const { message } = req.body;
  await prisma.message.create({
    data: {
        interviewId: req.params.interviewId!,
        type: "User",
        message: message
    }
  });

  res.json({message: "Message saved"});
})

app.get("/api/v1/result/:interviewId", async (req, res) => {
  const interview = await prisma.interview.findFirst({
    where: {
      id: req.params.interviewId
    },
    include: {
      conversations: true
    }
  })

  if (!interview) {
    res.status(411).json({
      message: "Interview not found"
    })
    return 
  }

  res.json({
    score: interview?.score,
    feedback: interview?.feedback,
    transcript: interview?.conversations.map(c => ({
      type: c.type,
      content: c.message,
      createdAt: c.createdAt
    })),
    status: interview.status
  })

  // TODO: Should add some sort of a lock here.
  if (interview.status != "Done") {
    const result = await calculateResult(interview.conversations, interview.targetRole, interview.candidateName)

    await prisma.interview.update({
      where: {
        id: req.params.interviewId
      },
      data: {
        status: "Done",
        feedback: result.feedback,
        score: result.score
      }
    })
  }
})

app.listen(3001);
