import { z } from "zod";
import axios from "axios";

const outputSchema = z.object({
    feedback: z.string().describe("Feedback for the user"),
    score: z.number().describe("Score out of 10 for their interview"),
});

const RESULT_PROMPT = `
    You are an expert evaluator. Your job is to evaluate the users interview. Give them a score out of 10
    and also let them know any feedback you have about thier interview.

    Please return only a json which looks like this - 
    {
        feedback: string,
        score: number
    }

    DO NOT RETURN ANY OTHER TEXT
    {{USER_TRANSCRIPT}}
`;

async function queryGroq(prompt: string, jsonMode: boolean = false): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY is not configured in the .env file.");
    }
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            model: model,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
        },
        {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("Groq API returned an empty response.");
    }
    return content.trim();
}

export async function calculateResult(
    messages: {type: "Assistant" | "User", message: string, createdAt: Date}[],
    targetRole?: string | null,
    candidateName?: string | null
) {
    const transcript = JSON.stringify(messages.map(m => `${m.type}: ${m.message}`), null, 2);
    const evaluationPrompt = `You are an expert technical interviewer and evaluator. Your job is to evaluate the interview transcript of candidate "${candidateName || "Candidate"}" who interviewed for the target role "${targetRole || "Software Developer"}".
Score their performance out of 10 and provide comprehensive constructive feedback tailored specifically to the target role requirements.

Here is the transcript:
${transcript}

Please return only a JSON object matching this schema:
{
    "feedback": string,
    "score": number
}

DO NOT RETURN ANY OTHER TEXT.`;

    const rawResult = await queryGroq(evaluationPrompt, true);
    console.log("Groq Evaluation Response:", rawResult);
    
    // Parse the JSON output and validate it with our Zod schema
    const result = outputSchema.parse(JSON.parse(rawResult));
    return result;
}

export async function generateText(prompt: string): Promise<string> {
    return queryGroq(prompt, false);
}