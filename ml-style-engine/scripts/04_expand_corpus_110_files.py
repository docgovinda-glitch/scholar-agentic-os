import os
import re
import json
import time
import hashlib
import requests
from bs4 import BeautifulSoup

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CORPUS_DIR = os.path.join(BASE_DIR, "corpus")
MANIFEST_PATH = os.path.join(BASE_DIR, "corpus_manifest.json")

NEW_20_SPEC = {
    "journal_article": {
        "label": "Journal Article",
        "primary_tone": "Formal Academic",
        "secondary_tone": "Objective",
        "files": [
            ("journal_01_q1_imrad_clinical_trial_methodology.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"randomized trial" AND "methodology" AND "clinical")'),
            ("journal_02_q1_computational_machine_learning_architecture.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"deep learning" AND "architecture" AND "ablation")'),
            ("journal_03_q1_econometric_causal_inference_panel.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("causal inference" AND "instrumental variable" AND "panel")'),
            ("journal_04_q1_molecular_biology_experimental_protocol.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"molecular" AND "mechanism" AND "assay")'),
            ("journal_05_q1_environmental_science_geospatial_modeling.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"remote sensing" AND "spatial modeling" AND "uncertainty")'),
            ("journal_06_q1_cognitive_neuroscience_behavioral_paradigm.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"neuroimaging" AND "cognitive" AND "paradigm")'),
            ("journal_07_q1_materials_engineering_characterization.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"characterization" AND "nanomaterials" AND "synthesis")'),
            ("journal_08_q1_public_health_epidemiological_surveillance.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"epidemiological" AND "multicenter" AND "cohort")'),
            ("journal_09_q1_information_systems_design_science.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("design science" AND "information systems" AND "evaluation")'),
            ("journal_10_q1_quantitative_sociology_network_analysis.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"social network analysis" AND "longitudinal")'),
        ]
    },
    "presentation_slides": {
        "label": "Presentation Slides",
        "primary_tone": "Conversational Academic",
        "secondary_tone": "Persuasive",
        "files": [
            ("presentation_01_visual_communication_scientific_presentations.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"oral presentation" OR TITLE:"scientific presentation" OR "scientific talks")'),
            ("presentation_02_cognitive_load_multimedia_slide_design.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("multimedia learning" AND "cognitive load" AND "slide")'),
            ("presentation_03_data_visualization_graphical_perception.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"data visualization" AND "perception" AND "scientific")'),
            ("presentation_04_assertion_evidence_slide_structure.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("PowerPoint" AND "slide" AND "engineering education")'),
            ("presentation_05_scientific_storytelling_narrative_arc.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("science communication" AND "storytelling" AND "narrative")'),
            ("presentation_06_poster_and_short_talk_visual_abstracts.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"visual abstract" OR TITLE:"scientific poster")'),
            ("presentation_07_executive_briefing_decision_oriented_decks.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("policy brief" AND "evidence" AND "visual communication")'),
            ("presentation_08_accessible_typography_color_contrast_slides.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("color vision deficiency" AND "scientific figures" AND "visualization")'),
            ("presentation_09_interactive_teaching_lectures_active_recall.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("lecture" AND "slide design" AND "student attention")'),
            ("presentation_10_defense_viva_voce_research_pitch_structure.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("academic presentation" AND "conference" AND "communication skills")'),
        ]
    }
}

def normalize_citations(text: str) -> str:
    text = re.sub(r'\([A-Z][A-Za-z\s,&.\-]+,\s*\d{4}[a-z]?\)', '[1]', text)
    text = re.sub(r'\[\d+(?:\s*[,–-]\s*\d+)*\]', '[1]', text)
    return re.sub(r'\s+', ' ', text).strip()

def collect_existing_pmcids_and_hashes():
    used_pmcids = set()
    used_hashes = set()
    if os.path.exists(CORPUS_DIR):
        for root, _, files in os.walk(CORPUS_DIR):
            for file in files:
                if file.endswith(".json"):
                    fpath = os.path.join(root, file)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if data.get("pmcid"):
                                used_pmcids.add(data["pmcid"])
                            if data.get("sha256"):
                                used_hashes.add(data["sha256"])
                    except Exception:
                        pass
    return used_pmcids, used_hashes

def fetch_one_valid_paper(query: str, used_pmcids: set, used_hashes: set):
    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    query_variants = [
        query,
        'OPEN_ACCESS:Y AND IN_EPMC:Y AND (' + query.split('AND (')[-1],
        query.replace('TITLE:', ''),
        'OPEN_ACCESS:Y AND IN_EPMC:Y AND ' + ' '.join(re.findall(r'"([^"]+)"', query))
    ]
    for attempt_query in query_variants:
        params = {"query": attempt_query, "resultType": "core", "pageSize": 35, "format": "json"}
        try:
            resp = requests.get(search_url, params=params, timeout=30)
            if resp.status_code != 200:
                continue
            results = resp.json().get("resultList", {}).get("result", [])
        except Exception as e:
            print(f"    Search error on query: {e}")
            continue

        for item in results:
            pmcid = item.get("pmcid")
            if not pmcid or pmcid in used_pmcids:
                continue
            xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
            try:
                xml_resp = requests.get(xml_url, timeout=25)
                if xml_resp.status_code != 200:
                    continue
            except Exception:
                continue

            soup = BeautifulSoup(xml_resp.text, "lxml-xml")
            body = soup.find("body")
            if not body:
                continue

            paragraphs = [
                normalize_citations(p.get_text(" ", strip=True))
                for p in body.find_all("p")
                if len(p.get_text(" ", strip=True).split()) >= 35
            ]
            full_text = "\n\n".join(paragraphs)
            word_count = len(full_text.split())

            if word_count >= 1200:
                sha256_hash = hashlib.sha256(full_text.encode("utf-8")).hexdigest()
                if sha256_hash in used_hashes:
                    continue
                used_pmcids.add(pmcid)
                used_hashes.add(sha256_hash)
                pub_year = item.get("pubYear")
                if not pub_year or pub_year == "N/A":
                    pub_date_tag = soup.find("pub-date")
                    if pub_date_tag:
                        yr_tag = pub_date_tag.find("year")
                        if yr_tag and yr_tag.get_text(strip=True):
                            pub_year = yr_tag.get_text(strip=True)
                try:
                    pub_year = int(pub_year)
                except (ValueError, TypeError):
                    pub_year = pub_year or "N/A"

                return {
                    "pmcid": pmcid,
                    "doi": item.get("doi", "N/A"),
                    "title": item.get("title", "Untitled"),
                    "pubYear": pub_year,
                    "word_count": word_count,
                    "paragraphs": paragraphs,
                    "full_text": full_text,
                    "sha256": sha256_hash
                }

    raise RuntimeError(f"Could not retrieve valid full-text paper for query: {query}")

def main():
    used_pmcids, used_hashes = collect_existing_pmcids_and_hashes()
    print(f"Loaded {len(used_pmcids)} existing PMCIDs across current corpus.")

    manifest = {}
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            manifest = {}

    total_downloaded = 0
    total_new = sum(len(meta["files"]) for meta in NEW_20_SPEC.values())

    for arch_id, meta in NEW_20_SPEC.items():
        arch_dir = os.path.join(CORPUS_DIR, arch_id)
        os.makedirs(arch_dir, exist_ok=True)
        manifest[arch_id] = {
            "label": meta["label"],
            "primary_tone": meta["primary_tone"],
            "secondary_tone": meta["secondary_tone"],
            "files": manifest.get(arch_id, {}).get("files", [])
        }
        # Index existing files in manifest
        existing_filenames = {f["filename"] for f in manifest[arch_id]["files"]}

        for filename, query in meta["files"]:
            target_path = os.path.join(arch_dir, filename)
            # Check if file already exists with valid content
            if os.path.exists(target_path):
                try:
                    with open(target_path, "r", encoding="utf-8") as f:
                        existing_data = json.load(f)
                        if existing_data.get("word_count", 0) >= 1200 and existing_data.get("sha256"):
                            print(f"Skipping already valid: [{arch_id}] -> {filename}")
                            total_downloaded += 1
                            if filename not in existing_filenames:
                                manifest[arch_id]["files"].append({
                                    "filename": filename,
                                    "path": target_path,
                                    "pmcid": existing_data["pmcid"],
                                    "title": existing_data["title"],
                                    "word_count": existing_data["word_count"],
                                    "sha256": existing_data["sha256"]
                                })
                            continue
                except Exception:
                    pass

            total_downloaded += 1
            print(f"[{total_downloaded}/{total_new}] Downloading [{arch_id}] -> {filename} ...")
            paper = fetch_one_valid_paper(query, used_pmcids, used_hashes)
            payload = {
                "target_filename": filename,
                "archetype_id": arch_id,
                "assignment_type": meta["label"],
                "primary_tone": meta["primary_tone"],
                "secondary_tone": meta["secondary_tone"],
                **paper
            }
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)

            manifest[arch_id]["files"].append({
                "filename": filename,
                "path": target_path,
                "pmcid": paper["pmcid"],
                "title": paper["title"],
                "word_count": paper["word_count"],
                "sha256": paper["sha256"]
            })
            print(f"    Saved: {filename} ({paper['word_count']} words, PMCID: {paper['pmcid']})")
            time.sleep(0.15)

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("\nALL 20 EXACT NAMED FILES FOR OT-10 AND OT-22 DOWNLOADED AND VERIFIED.")

if __name__ == "__main__":
    main()
