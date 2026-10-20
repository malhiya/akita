from classifier import classify_task, keyword_classify
from groq_client import get_client

LINES = [
    "give Luna her thyroid tablet",
    "insulin shot for Max with dinner",
    "take Max to the groomer",
    "trim Whiskers' claws",
    "let Luna burn off energy at the park",
    "check Max's blood sugar",
    "clean the litter box",
    "do the morning thing",
]

if __name__ == "__main__":
    client = get_client()
    for text in LINES:
        ai = classify_task(client, text, "Dog")
        kw = keyword_classify(text)
        print(f"{text!r}")
        print(f"   AI : {ai.category}/{ai.priority} ({ai.source})")
        print(f"   KW : {kw[0]}/{kw[1]}")