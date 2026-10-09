import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")


def get_client() -> Groq | None:
    key = os.getenv("GROQ_API_KEY")
    return Groq(api_key=key) if key else None


if __name__ == "__main__":
    client = get_client()
    if client is None:
        raise SystemExit("GROQ_API_KEY is not set")
    reply = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
    )
    print(reply.choices[0].message.content)