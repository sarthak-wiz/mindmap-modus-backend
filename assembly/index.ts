import { auth, http, postgresql } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import { Content } from "@hypermode/modus-sdk-as/assembly/http";
const dbName = "db";

// Models
@json
class ClerkClaims {
  public sub!: string;
  public exp!: i64;
  public iat!: i64;
}

@json
class ResponseFormat {
  type!: string;
}

@json
class OpenAIChatInput {
  model!: string;
  messages!: Message[];
  response_format!: ResponseFormat;
}

@json
class Message {
  role!: string;
  content!: string;
}

@json
class OpenAIChatOutput {
  choices!: Choice[];
}

@json
class Choice {
  message!: Message;
}

@json
class Mindmap {
  id!: string;
  content!: string;
  created_at!: i64;
  clerk_user_id!: string;
}

@json
class ErrorResponse {
  error!: string;
  status!: i32;
}


@json
class MindmapResponse {
  mindmap!: string;
}

// Function to get the current authenticated user's ID
export function getCurrentUserId(): string {

  const claims = auth.getJWTClaims<ClerkClaims>();
  if (!claims || !claims.sub) {
    throw new Error("User not authenticated");
  }
  return claims.sub;
}

// Function to generate mindmap using OpenAI
export function generateMindmap(userAsk: string): Mindmap {

    if (!userAsk || userAsk.trim().length === 0) {
      throw new Error("User ask cannot be empty");
    }

    const systemPrompt = `We need a mindmap generated for user's ask which is: ${userAsk}, it should be in the format of markdown so that we can later render it using markmap
    So generate a mindmap in markdown string inside a json object with the following format:
    {
      "mindmap": "<markdown mindmap string>"
    }
    `;

    const request = new http.Request('https://api.openai.com/v1/chat/completions');
    request.headers.append("Content-Type", "application/json");

    const body = new OpenAIChatInput();
    body.messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userAsk }
    ];
    body.model = "gpt-4o-mini";
    body.response_format = { type: "json_object" };
    const options = new http.RequestOptions();
    options.method = "POST";
    options.body = Content.from(body);

    console.log( Content.from(body).text());
    
    
    const response = http.fetch(request, options);

    if (response.status !== 200) {
      throw new Error(`OpenAI API error: ${response.status.toString()} ${response.statusText} response: ${response.text()}`);
    }
    
    const responseJson = JSON.parse<OpenAIChatOutput>(response.text());
    const mindmapJsonContent = responseJson.choices[0].message.content;

    const mindmapResponse = JSON.parse<MindmapResponse>(mindmapJsonContent);

    // Save to database
    const userId = getCurrentUserId();
    const query = `
      INSERT INTO mindmaps (content, clerk_user_id, created_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const params = new postgresql.Params();
    params.push(mindmapResponse.mindmap);
    params.push(userId);
    params.push(Date.now());

    const dbResponse = postgresql.query<Mindmap>(dbName, query, params);
    const row = dbResponse.rows[0];
    return row;
}

// Function to get user's mindmaps
export function getMyMindmaps(): Mindmap[] {

    const userId = getCurrentUserId();
    
    const query = `
      SELECT * FROM mindmaps 
      WHERE clerk_user_id = $1 
      ORDER BY created_at DESC
    `;
    
    const params = new postgresql.Params();
    params.push(userId);

    const response = postgresql.query<Mindmap>(dbName, query, params);
    return response.rows;

} 