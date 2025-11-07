from flask import Blueprint, request, jsonify
from app.services.supabase_service import get_supabase_client

rocks_bp = Blueprint("rocks", __name__)

@rocks_bp.get("/rocks")
def retrieve_rock_infos():
    name = (request.args.get("nom") or "").strip()
    if not name:
        return jsonify({"message": "Parametre 'nom' requis"}), 400

    supabase = get_supabase_client()

    res = supabase.table("infos_roches").select("*").eq("nom", name).execute()
    rows = res.data
    if not rows:
        return jsonify({"message": f"Roche inconnue: {name}"}), 404

    return jsonify(rows[0]), 200
