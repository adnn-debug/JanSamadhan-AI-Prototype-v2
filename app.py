from flask import Flask, render_template, jsonify, request
from groq import Groq
from database import (
    enabled as database_enabled,
    get_account,
    get_challenge,
    health as database_health,
    init_database,
    list_accounts,
    list_challenges,
    reserve_daily_limit,
    seed_data,
    upsert_account,
    upsert_challenge,
)

import json
import os
import re
import time
from collections import defaultdict, deque
from urllib.parse import urlencode
from urllib.request import Request, urlopen

app = Flask(__name__)

LGD_BASE_URL = "https://lgdirectory.gov.in/webservices/lgdws"
JHARKHAND_LGD_STATE_CODE = 20
_LGD_CACHE = {}
_LGD_CACHE_TTL_SECONDS = 6 * 60 * 60


def _lgd_rows(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "records", "response", "result", "items"):
            rows = payload.get(key)
            if isinstance(rows, list):
                return rows
    return []


def _lgd_fetch(endpoint, params):
    query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    url = f"{LGD_BASE_URL}/{endpoint}"
    if query:
        url += "?" + query
    cache_key = url
    cached = _LGD_CACHE.get(cache_key)
    now_ts = time.time()
    if cached and now_ts - cached["at"] < _LGD_CACHE_TTL_SECONDS:
        return cached["data"]

    last_error = None
    for method in ("POST", "GET"):
        try:
            req = Request(
                url,
                data=b"" if method == "POST" else None,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "JanSamadhan-AI/1.0 (SIH prototype; LGD directory lookup)",
                },
                method=method,
            )
            with urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))
            rows = _lgd_rows(payload)
            _LGD_CACHE[cache_key] = {"at": now_ts, "data": rows}
            return rows
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"LGD directory request failed: {last_error}")


def _positive_int(value, field_name):
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}")
    if parsed <= 0:
        raise ValueError(f"Invalid {field_name}")
    return parsed


try:
    _preview_lgd_probe = _lgd_fetch("districtList", {"stateCode": JHARKHAND_LGD_STATE_CODE})
    app.logger.warning("LGD preview probe ok=%s Jharkhand_district_rows=%s", bool(_preview_lgd_probe), len(_preview_lgd_probe))
except Exception as exc:
    app.logger.warning("LGD preview probe failed: %s", exc)


try:
    init_database()
except Exception:
    app.logger.exception("PostgreSQL initialization failed; local demo mode remains available")

_boot_storage = database_health()
app.logger.warning(
    "PostgreSQL boot health enabled=%s ok=%s database=%s version=%s",
    _boot_storage.get("enabled"),
    _boot_storage.get("ok"),
    _boot_storage.get("database"),
    _boot_storage.get("version"),
)

GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
MAX_REQUESTS = 60
RATE_WINDOW_SECONDS = 10 * 60
request_log = defaultdict(deque)

ALLOWED_CATEGORIES = [
    "Education", "Agriculture", "Healthcare", "Water Resources",
    "Sanitation", "Environment", "Energy", "Urban Development",
    "Accessibility", "Public Administration", "Rural Livelihoods", "Other"
]

CATEGORY_RULES = {
    "Education": ["school", "college", "classroom", "teacher", "student", "library", "education"],
    "Agriculture": ["farmer", "crop", "irrigation", "farm", "soil", "agriculture"],
    "Healthcare": ["hospital", "clinic", "doctor", "health", "medicine", "ambulance"],
    "Water Resources": ["water", "tap", "drinking water", "pipeline", "leak", "contamination", "जल"],
    "Sanitation": ["garbage", "waste", "sewage", "drain", "sanitation", "toilet", "कचरा"],
    "Environment": ["pollution", "air quality", "river", "plastic", "environment", "smoke", "पेड़"],
    "Energy": ["electric", "electricity", "streetlight", "street light", "power", "wire", "transformer"],
    "Urban Development": ["road", "pothole", "bridge", "traffic", "footpath", "street", "building"],
    "Accessibility": ["wheelchair", "disabled", "accessible", "ramp", "blind", "accessibility"],
    "Public Administration": ["certificate", "office", "public service", "administration", "queue", "record"],
    "Rural Livelihoods": ["village", "livelihood", "self help group", "rural", "employment"],
}

AUTHORITY_MAP = {
    "Education": "Education Authority",
    "Agriculture": "Agriculture / Rural Development Authority",
    "Healthcare": "Public Health Authority",
    "Water Resources": "Water Supply / Water Resources Authority",
    "Sanitation": "Sanitation / Waste Authority",
    "Environment": "Environment / Pollution Control Authority",
    "Energy": "Electricity / Utility Authority",
    "Urban Development": "Road / Public Works Authority",
    "Accessibility": "District / Local Administration",
    "Public Administration": "District / Local Administration",
    "Rural Livelihoods": "Rural Development Authority",
    "Other": "District / Local Administration",
}

DANGER_TERMS = [
    "live wire", "exposed wire", "electric shock", "electrocution", "gas leak",
    "fire", "building collapse", "bridge collapse", "landslide", "open manhole",
    "fallen electric pole", "contaminated drinking water", "unsafe drinking water"
]

DIRECT_TERMS = [
    "pothole", "garbage", "waste collection", "broken streetlight", "streetlight not working",
    "sewage overflow", "blocked drain", "broken pipe", "road repair", "fallen pole",
    "damaged sign", "cleaning", "repair", "maintenance"
]

INNOVATION_TERMS = [
    "prototype", "research", "sensor", "monitoring system", "prediction", "early warning",
    "new solution", "design", "automation", "data analysis", "machine learning", "ai system",
    "field study", "testing", "experiment", "low cost solution"
]

HYBRID_TERMS = [
    "repeated", "recurring", "contamination", "flooding", "water quality", "pollution",
    "landslide", "structural", "complex", "multiple locations", "chronic", "survey",
    "testing required", "technical investigation"
]


def _inject_ai_addon(html):
    if '/static/official-prototype-v1.js' not in html:
        html = html.replace("</head>", '  <script src="/static/official-prototype-v1.js"></script>\n</head>')
    addons = (
        '<script src="/static/jansahayak-ai-v3.js" defer></script>\n'
        '<script src="/static/demo-mode-ui.js" defer></script>'
    )
    if '/static/demo-mode-ui.js' in html:
        return html
    return html.replace("</body>", "  " + addons + "\n</body>")


@app.get("/")
def home():
    return _inject_ai_addon(render_template("index.html"))


@app.get("/health")
def health():
    mode = "groq+local-fallback" if os.environ.get("GROQ_API_KEY") else "local-fallback"
    storage = database_health()
    return jsonify(
        status="ok",
        service="JanSamadhan AI",
        ai_mode=mode,
        storage="postgresql" if storage.get("ok") else "local-fallback",
        storage_ok=bool(storage.get("ok")),
    ), 200


def _storage_error():
    return jsonify(error="PostgreSQL storage is not configured or unavailable."), 503


@app.get("/api/storage/health")
def storage_health():
    status = database_health()
    return jsonify(status), (200 if status.get("ok") else 503)


@app.get("/api/jharkhand/districts")
def jharkhand_districts():
    try:
        rows = _lgd_fetch("districtList", {"stateCode": JHARKHAND_LGD_STATE_CODE})
        items = sorted(
            [
                {
                    "code": str(row.get("districtCode", "")).strip(),
                    "name": str(row.get("districtNameEnglish", "")).strip().title(),
                }
                for row in rows
                if row.get("districtCode") and row.get("districtNameEnglish")
            ],
            key=lambda item: item["name"],
        )
        return jsonify(state="Jharkhand", state_code=str(JHARKHAND_LGD_STATE_CODE), source="LGD", items=items)
    except Exception as exc:
        app.logger.warning("LGD district lookup failed: %s", exc)
        return jsonify(error="Jharkhand LGD district directory is temporarily unavailable."), 503


@app.get("/api/jharkhand/subdistricts")
def jharkhand_subdistricts():
    try:
        district_code = _positive_int(request.args.get("district_code"), "district code")
        rows = _lgd_fetch("subdistrictList", {"districtCode": district_code})
        items = sorted(
            [
                {
                    "code": str(row.get("subdistrictCode", "")).strip(),
                    "name": str(row.get("subdistrictNameEnglish", "")).strip(),
                }
                for row in rows
                if row.get("subdistrictCode") and row.get("subdistrictNameEnglish")
            ],
            key=lambda item: item["name"].lower(),
        )
        return jsonify(source="LGD", district_code=str(district_code), items=items)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        app.logger.warning("LGD sub-district lookup failed: %s", exc)
        return jsonify(error="Jharkhand LGD sub-district directory is temporarily unavailable."), 503


@app.get("/api/jharkhand/villages")
def jharkhand_villages():
    try:
        subdistrict_code = _positive_int(request.args.get("subdistrict_code"), "sub-district code")
        rows = _lgd_fetch("villageListWithHierarchy", {"subDistrictCode": subdistrict_code})
        items = sorted(
            [
                {
                    "code": str(row.get("villageCode", "")).strip(),
                    "name": str(row.get("villageNameEnglish", "")).strip(),
                    "status": str(row.get("villageStatus", "")).strip(),
                }
                for row in rows
                if row.get("villageCode") and row.get("villageNameEnglish")
            ],
            key=lambda item: item["name"].lower(),
        )
        return jsonify(source="LGD", subdistrict_code=str(subdistrict_code), items=items)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        app.logger.warning("LGD village lookup failed: %s", exc)
        return jsonify(error="Jharkhand LGD village directory is temporarily unavailable."), 503


@app.get("/api/jharkhand/urban-bodies")
def jharkhand_urban_bodies():
    try:
        type_labels = {4: "Municipal Corporation", 5: "Municipality", 7: "Town Panchayat"}
        seen = {}
        for type_code, fallback_label in type_labels.items():
            rows = _lgd_fetch(
                "localBodyList",
                {"stateCode": JHARKHAND_LGD_STATE_CODE, "localbodyTypeCode": type_code},
            )
            for row in rows:
                code = str(row.get("localBodyCode", "")).strip()
                name = str(row.get("localBodyNameEnglish", "")).strip()
                if not code or not name:
                    continue
                body_type = str(row.get("localBodyTypeName", "")).strip() or fallback_label
                seen[code] = {"code": code, "name": name, "type": body_type}
        items = sorted(seen.values(), key=lambda item: (item["name"].lower(), item["type"].lower()))
        return jsonify(state="Jharkhand", state_code=str(JHARKHAND_LGD_STATE_CODE), source="LGD", items=items)
    except Exception as exc:
        app.logger.warning("LGD urban local-body lookup failed: %s", exc)
        return jsonify(error="Jharkhand LGD urban directory is temporarily unavailable."), 503


@app.get("/api/accounts")
def api_accounts():
    if not database_enabled():
        return _storage_error()
    try:
        return jsonify(items=list_accounts()), 200
    except Exception:
        app.logger.exception("Could not list PostgreSQL accounts")
        return _storage_error()


@app.get("/api/accounts/<account_id>")
def api_account(account_id):
    if not database_enabled():
        return _storage_error()
    try:
        item = get_account(account_id)
        return (jsonify(item), 200) if item else (jsonify(error="Account not found."), 404)
    except Exception:
        app.logger.exception("Could not read PostgreSQL account")
        return _storage_error()


@app.put("/api/accounts/<account_id>")
def api_upsert_account(account_id):
    if not database_enabled():
        return _storage_error()
    payload = request.get_json(silent=True) or {}
    try:
        item = upsert_account(account_id, payload, merge=request.args.get("merge", "1") != "0")
        return jsonify(item), 200
    except Exception:
        app.logger.exception("Could not save PostgreSQL account")
        return _storage_error()


@app.get("/api/problems")
def api_problems():
    if not database_enabled():
        return _storage_error()
    try:
        return jsonify(items=list_challenges()), 200
    except Exception:
        app.logger.exception("Could not list PostgreSQL challenges")
        return _storage_error()


@app.get("/api/problems/<problem_id>")
def api_problem(problem_id):
    if not database_enabled():
        return _storage_error()
    try:
        item = get_challenge(problem_id)
        return (jsonify(item), 200) if item else (jsonify(error="Challenge not found."), 404)
    except Exception:
        app.logger.exception("Could not read PostgreSQL challenge")
        return _storage_error()


@app.put("/api/problems/<problem_id>")
def api_upsert_problem(problem_id):
    if not database_enabled():
        return _storage_error()
    payload = request.get_json(silent=True) or {}
    try:
        item = upsert_challenge(problem_id, payload, merge=request.args.get("merge", "1") != "0")
        return jsonify(item), 200
    except Exception:
        app.logger.exception("Could not save PostgreSQL challenge")
        return _storage_error()


@app.post("/api/cloud/seed")
def api_seed_cloud():
    if not database_enabled():
        return _storage_error()
    payload = request.get_json(silent=True) or {}
    try:
        result = seed_data(
            payload.get("accounts") or [],
            payload.get("problems") or [],
            force=bool(payload.get("force")),
        )
        return jsonify(result), 200
    except Exception:
        app.logger.exception("Could not seed PostgreSQL demo data")
        return _storage_error()


@app.post("/api/daily-limit/reserve")
def api_reserve_daily_limit():
    if not database_enabled():
        return _storage_error()
    payload = request.get_json(silent=True) or {}
    day = _clean(payload.get("day"), 10)
    citizen_hash = _clean(payload.get("citizenHash"), 128)
    if not day or not citizen_hash:
        return jsonify(error="day and citizenHash are required."), 400
    try:
        result = reserve_daily_limit(day, citizen_hash, payload.get("limit") or 10)
        return jsonify(result), 200
    except Exception:
        app.logger.exception("Could not reserve PostgreSQL daily limit")
        return _storage_error()


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited():
    now = time.time()
    q = request_log[_client_ip()]
    while q and now - q[0] > RATE_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= MAX_REQUESTS:
        return True
    q.append(now)
    return False


def _clean(value, limit=4000):
    return str(value or "").strip()[:limit]


def _contains_any(text, terms):
    return any(term in text for term in terms)


def _category(text, requested=""):
    requested = _clean(requested, 100)
    if requested in ALLOWED_CATEGORIES and requested != "Other":
        return requested
    scores = {category: sum(1 for term in terms if term in text) for category, terms in CATEGORY_RULES.items()}
    best = max(scores, key=scores.get) if scores else "Other"
    return best if scores.get(best, 0) > 0 else "Other"


def _demo_analysis(payload, admin=False):
    title = _clean(payload.get("title"), 220)
    description = _clean(payload.get("description"), 1500)
    location = _clean(payload.get("location"), 260)
    district = _clean(payload.get("district"), 100)
    requested_category = _clean(payload.get("category"), 100)
    try:
        affected = int(payload.get("affected") or 0)
    except (TypeError, ValueError):
        affected = 0

    text = f"{title} {description} {location} {district}".lower()
    category = _category(text, requested_category)
    authority = AUTHORITY_MAP.get(category, AUTHORITY_MAP["Other"])
    critical = _contains_any(text, DANGER_TERMS)
    priority = "Critical" if critical else "High" if affected >= 300 else "Medium" if affected >= 75 else "Normal"

    direct_signal = _contains_any(text, DIRECT_TERMS)
    innovation_signal = _contains_any(text, INNOVATION_TERMS)
    hybrid_signal = _contains_any(text, HYBRID_TERMS)

    if innovation_signal and not direct_signal and not hybrid_signal:
        resolution_path = "Collaborative Innovation"
        collaborators = ["Students", "University"]
        if any(x in text for x in ["equipment", "industry", "pilot", "manufacture", "deployment"]):
            collaborators.append("Industry")
        reason = "The issue appears to benefit from research, design or prototyping. Government remains the case owner while innovation partners support solution development."
    elif hybrid_signal or (innovation_signal and direct_signal):
        resolution_path = "Hybrid"
        collaborators = ["University"]
        if any(x in text for x in ["prototype", "survey", "field", "student", "research"]):
            collaborators.insert(0, "Students")
        if any(x in text for x in ["equipment", "technology", "pilot", "sensor", "industry"]):
            collaborators.append("Industry")
        collaborators = list(dict.fromkeys(collaborators))[:3]
        reason = "A responsible public authority must act, but technical investigation, testing or innovation support could improve the resolution."
    else:
        resolution_path = "Direct Government Action"
        collaborators = []
        reason = "This looks mainly like routine public-service, maintenance or operational work that should be handled directly by the responsible authority."

    target_days = 1 if critical else 5 if resolution_path == "Direct Government Action" and priority in {"High", "Medium"} else 7 if resolution_path == "Direct Government Action" else 14 if resolution_path == "Hybrid" else 21

    missing = []
    if not location:
        missing.append("Exact locality or landmark")
    if affected <= 0:
        missing.append("Approximate number of people affected")
    if len(description) < 35:
        missing.append("A clearer description of what is happening")
    if not any(word in text for word in ["day", "week", "month", "since", "today", "yesterday"]):
        missing.append("How long the issue has been happening")

    summary = title or description[:120] or "Citizen-reported civic challenge"
    if len(summary) > 150:
        summary = summary[:147] + "..."

    if admin:
        if critical:
            next_action = f"Verify the immediate safety risk and route the case to {authority} for urgent professional action."
        elif resolution_path == "Direct Government Action":
            next_action = f"Verify the report and assign it to {authority}. Keep the case in the same Challenge-ID timeline until completion is verified."
        elif resolution_path == "Hybrid":
            next_action = f"Verify the report, keep {authority} as the responsible authority, and add only the technical or academic support that is actually useful."
        else:
            next_action = "Verify that the challenge genuinely needs innovation work, then invite suitable student/university support under government supervision."
    else:
        next_action = "Administrator verification is required before routing or assignment is treated as confirmed."

    return {
        "mode": "local-fallback",
        "summary": summary,
        "suggested_category": category,
        "priority": priority,
        "responsible_authority": authority,
        "resolution_path": resolution_path,
        "recommended_collaborators": collaborators,
        "reason": reason,
        "recommended_action": next_action,
        "missing_information": missing[:4],
        "target_days": target_days,
        "target_note": "Prototype accountability target only — not an official SLA.",
    }


def _demo_chat(message):
    raw = _clean(message, 1200)
    text = raw.lower()
    hindi = bool(re.search(r"[\u0900-\u097F]", raw))
    if hindi:
        if any(x in text for x in ["सरकार", "अथॉरिटी", "authority", "government"]):
            return "हर केस का मुख्य मालिक Government / Nodal Administrator रहता है। AI केवल जिम्मेदार प्राधिकरण और समाधान मार्ग सुझाता है; अंतिम रूटिंग मानव प्रशासक तय करता है।"
        if any(x in text for x in ["student", "university", "industry", "छात्र", "विश्वविद्यालय", "उद्योग"]):
            return "छात्र, विश्वविद्यालय और उद्योग हर समस्या में शामिल नहीं होते। उन्हें तभी जोड़ा जाता है जब शोध, परीक्षण, प्रोटोटाइप, विशेषज्ञता या संसाधनों की सच में जरूरत हो।"
        if any(x in text for x in ["overdue", "delay", "देरी", "नहीं हुआ", "fix"]):
            return "अगर तय प्रोटोटाइप समय में काम पूरा नहीं होता, केस Overdue दिखता है और Government/Nodal Admin उसे escalate, reassign या collaboration जोड़ सकता है। वही Challenge ID और वही tracker चलता रहता है।"
        return "जनसमाधान में हर समस्या एक ही Challenge ID के तहत चलती है। Government case owner रहता है और समस्या के अनुसार Direct Government Action, Collaborative Innovation या Hybrid मार्ग चुना जाता है।"

    if any(x in text for x in ["government", "authority", "department", "owner"]):
        return "Government / the Nodal Administrator remains the owner of every case. The system recommends a responsible functional authority and a resolution path, but a human administrator confirms the routing."
    if any(x in text for x in ["student", "university", "industry", "collaboration"]):
        return "Students, universities and industry are optional contributors, not replacements for government. They are added only when research, testing, prototyping, expertise or resources can materially help."
    if any(x in text for x in ["overdue", "delay", "not fixed", "not solved", "escalat"]):
        return "If a confirmed route passes its prototype accountability target without verified completion, the case is marked overdue for the nodal administrator. It can then be escalated, reassigned, reviewed or given additional collaboration while keeping the same Challenge ID and tracker."
    if any(x in text for x in ["direct", "hybrid", "innovation", "resolution path"]):
        return "JanSamadhan uses three resolution paths: Direct Government Action for routine service work, Collaborative Innovation for research/prototyping work, and Hybrid when government action plus technical or academic support is useful."
    return "JanSamadhan keeps every reported problem under one Challenge ID and one transparent lifecycle. Government remains the case owner, while the resolution path determines whether direct authority action or optional innovation support is used."


def _groq_client():
    key = os.environ.get("GROQ_API_KEY")
    return Groq(api_key=key, timeout=20.0) if key else None


def _system_prompt():
    return """You are JanSamadhan AI, the decision-support intelligence inside an academic Smart India Hackathon prototype.

GOVERNANCE MODEL
- Every citizen report is one governed case with one Challenge ID.
- Government / Nodal Administrator is always the case owner.
- Resolution path must be Direct Government Action, Collaborative Innovation, or Hybrid.
- Students, universities and industry are optional contributors only and never replace government ownership or final verification.

ROUTING
- Direct Government Action: routine maintenance, service delivery, enforcement or operational work.
- Collaborative Innovation: research, design, prototyping, field study or experimentation under government supervision.
- Hybrid: government action is required and technical, research, industry or student support can materially help.

RULES
- Never invent a Challenge ID, live status, approval, completion or assignment.
- Never present an AI recommendation as an official government order.
- Prefer generic functional authority names, not invented officers.
- Human administrator validation is final.
- Any target_days is a prototype accountability target, never an official SLA.
- Do not request passwords, OTPs, Aadhaar numbers or banking credentials.
- If there is immediate danger, advise contacting the appropriate emergency/responsible authority rather than relying only on this prototype.
- Use Hindi when the user writes mainly in Hindi; otherwise use English.
- Keep answers concise and easy to understand."""


def _groq_chat(message, history):
    client = _groq_client()
    if client is None:
        return None
    messages = [{"role": "system", "content": _system_prompt() + "\nYou are now JanSahayak, the citizen-facing assistant. Explain JanSamadhan and help with civic report wording, routing, collaboration, tracking and accountability. Do not claim to change database state. For live status, direct the user to the site's Challenge-ID tracker unless verified case data is supplied."}]
    if isinstance(history, list):
        for item in history[-8:]:
            if not isinstance(item, dict):
                continue
            content = _clean(item.get("content"), 700)
            if content:
                messages.append({"role": "user" if item.get("role") == "user" else "assistant", "content": content})
    messages.append({"role": "user", "content": _clean(message, 1200)})
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        reasoning_effort="low",
        max_completion_tokens=380,
        temperature=0.3,
    )
    return _clean(response.choices[0].message.content, 2400)


def _sanitize_llm_analysis(result):
    if not isinstance(result, dict):
        raise ValueError("Invalid Groq analysis")
    category = result.get("suggested_category", "Other")
    if category not in ALLOWED_CATEGORIES:
        category = "Other"
    priority = result.get("priority", "Normal")
    if priority not in {"Critical", "High", "Medium", "Normal"}:
        priority = "Normal"
    path = result.get("resolution_path", "Direct Government Action")
    if path not in {"Direct Government Action", "Collaborative Innovation", "Hybrid"}:
        path = "Direct Government Action"
    collaborators = result.get("recommended_collaborators", [])
    if not isinstance(collaborators, list):
        collaborators = []
    collaborators = [x for x in collaborators if x in {"Students", "University", "Industry"}][:3]
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
    return {
        "mode": "groq",
        "summary": _clean(result.get("summary"), 420),
        "suggested_category": category,
        "priority": priority,
        "responsible_authority": _clean(result.get("responsible_authority") or "District / Local Administration", 120),
        "resolution_path": path,
        "recommended_collaborators": collaborators,
        "reason": _clean(result.get("reason"), 650),
        "recommended_action": _clean(result.get("recommended_action"), 450),
        "missing_information": [_clean(x, 140) for x in missing[:4] if _clean(x, 140)],
        "target_days": target_days,
        "target_note": "Prototype accountability target only — not an official SLA.",
    }


def _groq_analysis(payload, admin=False):
    client = _groq_client()
    if client is None:
        return None
    instructions = """Analyze the civic challenge and return only a JSON object with these keys: summary, suggested_category, priority, responsible_authority, resolution_path, recommended_collaborators, reason, recommended_action, missing_information, target_days.

Constraints:
- suggested_category must be one of: %s
- priority: Critical, High, Medium, or Normal.
- resolution_path: Direct Government Action, Collaborative Innovation, or Hybrid.
- recommended_collaborators may contain only Students, University, Industry.
- Direct Government Action should normally have no innovation collaborators.
- responsible_authority should be a generic functional public authority.
- target_days must be 1 to 30 and is only a prototype target.
- Government/Nodal Administrator remains case owner.
- Do not invent a live status or official SLA.
%s""" % (
        ", ".join(ALLOWED_CATEGORIES),
        "This is an admin brief: recommend the administrator's next verification/routing action." if admin else "This is citizen intake decision support: routing remains a recommendation until admin verification."
    )
    case_data = {
        "challenge_id": _clean(payload.get("id"), 100) or None,
        "title": _clean(payload.get("title"), 220),
        "description": _clean(payload.get("description"), 1500),
        "category": _clean(payload.get("category"), 100) or None,
        "district": _clean(payload.get("district"), 100),
        "location": _clean(payload.get("location"), 260),
        "affected_people_reported": payload.get("affected") or 0,
        "current_stage": _clean(payload.get("stage"), 80) or None,
    }
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": instructions + "\nCASE DATA:\n" + json.dumps(case_data, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        reasoning_effort="low",
        max_completion_tokens=700,
        temperature=0.2,
    )
    raw = _clean(response.choices[0].message.content, 6000)
    return _sanitize_llm_analysis(json.loads(raw))


@app.post("/api/ai")
def ai():
    if _rate_limited():
        return jsonify(error="Too many requests. Please try again shortly."), 429

    data = request.get_json(silent=True) or {}
    task = _clean(data.get("task"), 40)
    payload = data.get("payload") or {}

    if task == "chat":
        message = _clean(payload.get("message"), 1200)
        if not message:
            return jsonify(error="Message is required."), 400
        try:
            reply = _groq_chat(message, payload.get("history", []))
            if reply:
                return jsonify(reply=reply, mode="groq"), 200
        except Exception:
            app.logger.exception("Groq chat unavailable; using local fallback")
        return jsonify(reply=_demo_chat(message), mode="local-fallback"), 200

    if task in {"analyze_report", "admin_brief"}:
        title = _clean(payload.get("title"), 220)
        description = _clean(payload.get("description"), 1500)
        if not title and not description:
            return jsonify(error="Add a title or description first."), 400
        try:
            analysis = _groq_analysis(payload, admin=(task == "admin_brief"))
            if analysis:
                return jsonify(analysis), 200
        except Exception:
            app.logger.exception("Groq analysis unavailable; using local fallback")
        return jsonify(_demo_analysis(payload, admin=(task == "admin_brief"))), 200

    return jsonify(error="Unsupported AI task."), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
