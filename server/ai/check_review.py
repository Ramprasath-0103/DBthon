"""Judge whether a review note is about its place.

stdin:  {"place": {"name", "category", "address"}, "note": "..."}
stdout: one JSON object shaped by verdict.schema.json
"""
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

HERE = Path(__file__).parent
load_dotenv(HERE.parent / ".env")  # REVIEW_CHECK_* settings

prompt = ChatPromptTemplate.from_messages([
    ("system", (HERE / "review_check_prompt.txt").read_text()),
    ("human", "<place>\nName: {name}\nCategory: {category}\nAddress: {address}\n</place>\n\n<note>\n{note}\n</note>"),
])
schema = json.loads((HERE / "verdict.schema.json").read_text())

# Any OpenAI-compatible endpoint; here the local proxy serving claude-sonnet-5.
llm = ChatOpenAI(
    model=os.getenv("REVIEW_CHECK_MODEL", "claude-sonnet-5"),
    base_url=os.environ["REVIEW_CHECK_BASE_URL"],
    api_key=os.environ["REVIEW_CHECK_API_KEY"],
    max_tokens=1024,
    timeout=15,
    max_retries=1,
)
chain = prompt | llm.with_structured_output(schema, method="json_schema", strict=True)

review = json.load(sys.stdin)
print(json.dumps(chain.invoke({**review["place"], "note": review["note"]})))
