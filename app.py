from flask import Flask, render_template, jsonify, request
from openai import OpenAI
import json
import os
import re
import time
from collections import defaultdict, deque

app = Flask(__name__)

# -------------------------------------------------------------------
# JanSamadhan AI v3 add-on configuration
# -------------------------------------------------------------------
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna")
MAX_REQUESTS = 20
RATE_WINDOW_SECONDS = 10 * 60
request_log = defaultdict(deque)

ALLOWED_CATEGORIES = [
    "Education",
    "Agriculture",
    "Healthcare",
    "Water Resources",
    "Sanitation",
    "Environment",
    "Energy",
    "Urban Development",
    "Accessibility",
    "Public Administration",
    "Rural Livelihoods",
    "Other",
]

RESOLUTION_PATHS = [
    "Direct Government Action",
    "Collaborative Innovation",
    "Hybrid",
]


def _inject_ai_addon(html: str) -> str:
    """
    Load the AI add-on without editing templates/index.html.
    Existing HTML/CSS/JS stays untouched.
    """
    addon = '<script src="/static/jansahayak-ai-v3.js" defer></script>'
    if addon in html:
        return html
    return html.replace("</body>", f"  {addon}\n</body>")


@app.get("/")
def home():
    # Keep the existing template exactly as it is and inject only our add-on.
    return _inject_ai_addon(render_template("index.html"))


@app.get("/health")
def health():
    # Existing health route preserved.
    return jsonify(status="ok", service="JanSamadhan AI"), 200


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited() -> bool:
    now = time.time()
    key = _client_ip()
    q = request_log[key]

    while q and now - q[0] > RATE_WINDOW_SECONDS:
        q.popleft()

    if len(q) >= MAX_REQUESTS:
        return True

    q.append(now)
    return False


def _get_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, timeout=25.0)


def _clean_text(value, limit=4000):
    return str(value or "").strip()[:limit]


def _extract_json(text: str):
    """
    Accept normal JSON or JSON wrapped in a markdown fence.
    """
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty model response")

    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        return json.loads(match.group(0))


def _base_instructions():
    return """
You are the AI decision-support layer inside JanSamadhan AI, an academic
Smart India Hackathon prototype.

CORE GOVERNANCE MODEL
- Every citizen report becomes ONE governed case with ONE Challenge ID.
- Government / the nodal administrator is always the CASE OWNER.
- The case may follow one of only three resolution paths:
  1. Direct Government Action
  2. Collaborative Innovation
  3. Hybrid
- Students, universities and industry are OPTIONAL contributors.
- They never replace government ownership or government verification.

DIRECT GOVERNMENT ACTION
Use when the issue is mainly routine service delivery, maintenance,
enforcement or operational action that a responsible public authority
can normally handle directly.

COLLABORATIVE INNOVATION
Use when the main work is research, design, prototyping, field study,
experimentation or a new solution and government supervision remains.

HYBRID
Use when a responsible government authority must act but technical,
research, testing, student or industry support can materially help.

SAFETY AND ACCURACY RULES
- Never invent a Challenge ID.
- Never invent a live complaint status.
- Never claim that an authority accepted, completed or verified work
  unless that fact is supplied in the request.
- Never present an AI recommendation as an official government order.
- Never invent an official legal SLA. Any target_days value is only a
  prototype accountability target and must be described that way.
- Prefer generic functional authority names such as
  "Road / Public Works Authority", "Water Supply Authority",
  "Electricity / Utility Authority", "Sanitation / Waste Authority",
  "Public Health Authority", "Environment / Pollution Control Authority",
  "Education Authority", "District / Local Administration",
  rather than inventing a specific office or officer.
- AI is decision support. Human administrator validation is final.
- Do not request passwords, OTPs, Aadhaar numbers, bank details or other
  credentials.
- If there is immediate danger, advise contacting the appropriate
  emergency/responsible authority and not relying only on this prototype.
- Be concise and citizen-friendly.
- Respond in Hindi when the user's input is mainly Hindi; otherwise use English.
""".strip()


def _call_text(client, instructions, payload, max_output_tokens=450):
    response = client.responses.create(
        model=MODEL,
        instructions=instructions,
        input=json.dumps(payload, ensure_ascii=False),
        max_output_tokens=max_output_tokens,
    )
    return (response.output_text or "").strip()


def _call_json(client, instructions, payload, max_output_tokens=700):
    text = _call_text(
        client,
        instructions + "\nReturn ONLY valid JSON. Do not use markdown fences.",
        payload,
        max_output_tokens=max_output_tokens,
    )
    return _extract_json(text)


def _sanitize_analysis(result):
    if not isinstance(result, dict):
        raise ValueError("Invalid analysis")

    category = result.get("suggested_category", "Other")
    if category not in ALLOWED_CATEGORIES:
        category = "Other"

    priority = result.get("priority", "Normal")
    if priority not in {"Critical", "High", "Medium", "Normal"}:
        priority = "Normal"

    path = result.get("resolution_path", "Direct Government Action")
    if path not in RESOLUTION_PATHS:
        path = "Direct Government Action"

    collaborators = result.get("recommended_collaborators", [])
    if not isinstance(collaborators, list):
        collaborators = []
    collaborators = [
        x for x in collaborators
        if x in {"Students", "University", "Industry"}
    ][:3]

    if path == "Direct Government Action":
        collaborators = []

    try:
        target_days = int(result.get("target_days", 7))
    except (TypeError, ValueError):
        target_days = 7
    target_days = max(1, min(target_days, 30))

    missing = result.get("missing_information", [])
    if not isinstance(missing, list):
        missing = []
    missing = [_clean_text(x, 140) for x in missing[:4] if _clean_text(x, 140)]

    return {
        "summary": _clean_text(result.get("summary"), 420),
        "suggested_category": category,
        "priority": priority,
        "responsible_authority": _clean_text(
            result.get("responsible_authority") or "District / Local Administration",
            120,
        ),
        "resolution_path": path,
        "recommended_collaborators": collaborators,
        "reason": _clean_text(result.get("reason"), 650),
        "recommended_action": _clean_text(result.get("recommended_action"), 450),
        "missing_information": missing,
        "target_days": target_days,
        "target_note": "Prototype accountability target only — not an official SLA.",
    }


@app.post("/api/ai")
def ai():
    if _rate_limited():
        return jsonify(error="AI request limit reached. Please try again later."), 429

    client = _get_client()
    if client is None:
        return jsonify(error="AI service is not configured."), 503

    data = request.get_json(silent=True) or {}
    task = _clean_text(data.get("task"), 40)
    payload = data.get("payload") or {}

    try:
        if task == "chat":
            message = _clean_text(payload.get("message"), 1200)
            if not message:
                return jsonify(error="Message is required."), 400

            history = payload.get("history", [])
            if not isinstance(history, list):
                history = []

            safe_history = []
            for item in history[-8:]:
                if not isinstance(item, dict):
                    continue
                role = "user" if item.get("role") == "user" else "assistant"
                content = _clean_text(item.get("content"), 700)
                if content:
                    safe_history.append({"role": role, "content": content})

            instructions = _base_instructions() + """

CHAT ROLE
You are JanSahayak. Explain JanSamadhan, help citizens phrase reports,
explain the single-case lifecycle, authority routing, resolution paths,
tracking, collaboration and accountability.

The website's deterministic code — not you — performs complaint submission,
Challenge-ID lookup, authentication, database writes, approvals and
verified status changes.

When asked for live status and no verified status data is supplied, tell
the user to use the Challenge-ID tracker rather than guessing.
""".rstrip()

            reply = _call_text(
                client,
                instructions,
                {
                    "conversation": safe_history,
                    "current_message": message,
                },
                max_output_tokens=380,
            )
            if not reply:
                raise ValueError("Empty AI response")
            return jsonify(reply=reply), 200

        if task in {"analyze_report", "admin_brief"}:
            title = _clean_text(payload.get("title"), 220)
            description = _clean_text(payload.get("description"), 1500)
            location = _clean_text(payload.get("location"), 260)
            district = _clean_text(payload.get("district"), 100)
            current_category = _clean_text(payload.get("category"), 100)
            current_stage = _clean_text(payload.get("stage"), 80)
            challenge_id = _clean_text(payload.get("id"), 100)

            try:
                affected = int(payload.get("affected") or 0)
            except (TypeError, ValueError):
                affected = 0

            if not title and not description:
                return jsonify(error="Add a title or description first."), 400

            extra = ""
            if task == "admin_brief":
                extra = """
This is an ADMIN AI BRIEF. In recommended_action, tell the government/nodal
administrator what to verify or do next. Keep government as case owner.
Use the supplied current stage only; do not invent a new status.
"""

            instructions = _base_instructions() + extra + f"""

ANALYSE THE CASE AND RETURN EXACTLY THIS JSON SHAPE:
{{
  "summary": "one short neutral case summary",
  "suggested_category": "one of: {", ".join(ALLOWED_CATEGORIES)}",
  "priority": "Critical | High | Medium | Normal",
  "responsible_authority": "generic functional public authority",
  "resolution_path": "Direct Government Action | Collaborative Innovation | Hybrid",
  "recommended_collaborators": ["Students", "University", "Industry"],
  "reason": "short explanation for the routing recommendation",
  "recommended_action": "short next step for the government/nodal administrator",
  "missing_information": ["up to four useful missing details"],
  "target_days": 7
}}

RULES FOR target_days:
- Integer from 1 to 30.
- It is only a PROTOTYPE accountability target, never an official SLA.
- Critical immediate-safety matters should be much shorter.
- Routine service issues can be short.
- Complex innovation/hybrid work can be longer.
"""

            result = _call_json(
                client,
                instructions,
                {
                    "challenge_id": challenge_id or None,
                    "title": title,
                    "description": description,
                    "location": location,
                    "district": district,
                    "affected_people_reported": affected,
                    "current_category": current_category or None,
                    "current_stage": current_stage or None,
                },
                max_output_tokens=700,
            )

            return jsonify(_sanitize_analysis(result)), 200

        return jsonify(error="Unsupported AI task."), 400

    except Exception:
        app.logger.exception("JanSamadhan AI request failed")
        return jsonify(error="AI decision support is temporarily unavailable."), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
