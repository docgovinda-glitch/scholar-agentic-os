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

EXACT_90_SPEC = {
    "essay": {
        "label": "Essay",
        "primary_tone": "Formal Academic",
        "secondary_tone": "Conversational Academic",
        "files": [
            ("essay_01_higher_education_pedagogy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"pedagogy" OR TITLE:"higher education") AND ("student agency" OR "curriculum")'),
            ("essay_02_epistemology_scientific_inquiry.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"epistemology" OR TITLE:"scientific inquiry" OR TITLE:"interdisciplinary")'),
            ("essay_03_ethics_of_artificial_intelligence.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"ethics" AND TITLE:"artificial intelligence")'),
            ("essay_04_climate_justice_global_south.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"climate justice" OR TITLE:"climate equity")'),
            ("essay_05_digital_public_sphere_democracy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"public sphere" OR TITLE:"digital democracy" OR TITLE:"deliberation")'),
            ("essay_06_public_health_social_determinants.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"social determinants of health" AND "inequality")'),
            ("essay_07_urbanization_sustainable_cities.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"sustainable cities" OR TITLE:"urban sustainability")'),
            ("essay_08_behavioral_economics_rationality.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"bounded rationality" OR TITLE:"choice architecture" OR TITLE:"behavioral economics")'),
            ("essay_09_cultural_globalization_identity.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"cultural identity" AND "globalization")'),
            ("essay_10_future_of_work_automation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"future of work" OR (TITLE:"automation" AND "employment"))'),
        ]
    },
    "literature_review": {
        "label": "Literature Review",
        "primary_tone": "Critical",
        "secondary_tone": "Analytical",
        "files": [
            ("lit_review_01_prisma_systematic_review_ai_education.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"systematic review" AND TITLE:"artificial intelligence" AND "education")'),
            ("lit_review_02_scoping_review_digital_mental_health.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"scoping review" AND TITLE:"digital mental health")'),
            ("lit_review_03_bibliometric_review_sustainable_finance.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"bibliometric" AND ("sustainable finance" OR "green finance"))'),
            ("lit_review_04_integrative_review_organizational_resilience.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"literature review" AND "organizational resilience")'),
            ("lit_review_05_umbrella_review_public_health_interventions.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"umbrella review" AND "public health")'),
            ("lit_review_06_systematic_review_supply_chain_risk.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"systematic review" AND "supply chain")'),
            ("lit_review_07_narrative_synthesis_remote_work_productivity.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"review" AND ("remote work" OR "telework") AND "productivity")'),
            ("lit_review_08_meta_synthesis_technology_adoption_models.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"systematic review" AND ("technology acceptance" OR "UTAUT"))'),
            ("lit_review_09_state_of_the_art_large_language_models.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"review" AND TITLE:"large language models")'),
            ("lit_review_10_critical_review_circular_economy_metrics.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"review" AND TITLE:"circular economy")'),
        ]
    },
    "research_paper": {
        "label": "Research Paper",
        "primary_tone": "Formal Academic",
        "secondary_tone": "Objective",
        "files": [
            ("research_paper_01_empirical_rct_educational_outcomes.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"randomized controlled trial" AND "academic achievement")'),
            ("research_paper_02_longitudinal_cohort_economic_mobility.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"longitudinal" AND "socioeconomic" AND "cohort")'),
            ("research_paper_03_cross_sectional_survey_consumer_trust.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"empirical" AND "consumer trust" AND "structural equation")'),
            ("research_paper_04_mixed_methods_healthcare_accessibility.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"mixed-methods" AND "healthcare access")'),
            ("research_paper_05_econometric_panel_renewable_energy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"panel data" AND "renewable energy" AND "economic growth")'),
            ("research_paper_06_experimental_study_cognitive_load.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"experimental" AND TITLE:"cognitive load")'),
            ("research_paper_07_quasi_experimental_urban_transport.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("difference-in-differences" AND "urban" AND "transport")'),
            ("research_paper_08_computational_benchmark_nlp_reasoning.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"benchmark" AND "natural language processing")'),
            ("research_paper_09_multivariate_analysis_fintech_adoption.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"fintech" OR TITLE:"mobile payment") AND "empirical"'),
            ("research_paper_10_epidemiological_modeling_air_quality.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"particulate matter" AND "exposure-response" AND "modeling")'),
        ]
    },
    "case_study": {
        "label": "Case Study",
        "primary_tone": "Analytical",
        "secondary_tone": "Objective",
        "files": [
            ("case_study_01_national_digital_payment_infrastructure.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND ("digital payment" OR "fintech" OR "digital infrastructure"))'),
            ("case_study_02_hospital_lean_management_transformation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "lean" AND "hospital")'),
            ("case_study_03_municipal_zero_waste_implementation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "waste management" AND "municipal")'),
            ("case_study_04_post_disaster_supply_chain_recovery.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "disaster" AND "resilience")'),
            ("case_study_05_university_blended_learning_transition.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "blended learning" AND "university")'),
            ("case_study_06_smart_grid_microgrid_rural_electrification.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND ("microgrid" OR "rural electrification"))'),
            ("case_study_07_corporate_esg_governance_restructuring.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND ("corporate governance" OR "sustainability reporting"))'),
            ("case_study_08_public_sector_agile_software_delivery.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND ("e-government" OR "public sector") AND "digital")'),
            ("case_study_09_community_based_ecotourism_conservation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "ecotourism" AND "conservation")'),
            ("case_study_10_cross_border_e_commerce_logistics.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"case study" AND "logistics" AND "supply chain")'),
        ]
    },
    "report": {
        "label": "Report",
        "primary_tone": "Objective",
        "secondary_tone": "Analytical",
        "files": [
            ("report_01_global_disease_burden_surveillance_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"surveillance report" AND "epidemiological")'),
            ("report_02_environmental_impact_assessment_watershed.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"assessment report" AND "environmental")'),
            ("report_03_national_cybersecurity_readiness_audit.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"report" AND "cybersecurity" AND "infrastructure")'),
            ("report_04_renewable_energy_grid_integration_technical_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"technical report" AND "energy")'),
            ("report_05_workforce_demographics_labor_market_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"report" AND "workforce" AND "demographics")'),
            ("report_06_pharmacovigilance_safety_monitoring_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"report" AND "pharmacovigilance" AND "safety")'),
            ("report_07_agricultural_yield_climate_vulnerability_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"report" AND "agricultural" AND "climate")'),
            ("report_08_public_transit_infrastructure_feasibility_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"feasibility" AND "transport" AND "infrastructure")'),
            ("report_09_higher_education_quality_assurance_audit.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"quality assurance" AND "higher education" AND "audit")'),
            ("report_10_digital_financial_inclusion_index_report.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("financial inclusion" AND "digital" AND "index")'),
        ]
    },
    "critical_essay": {
        "label": "Critical Essay",
        "primary_tone": "Critical",
        "secondary_tone": "Analytical",
        "files": [
            ("critical_essay_01_critique_of_neoliberal_higher_education.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critical" AND "neoliberal" AND "higher education")'),
            ("critical_essay_02_methodological_flaws_in_social_psychology.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critique" AND "methodology" AND "psychology")'),
            ("critical_essay_03_rethinking_gdp_as_welfare_indicator.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"beyond GDP" OR (TITLE:"rethinking" AND "economic growth"))'),
            ("critical_essay_04_algorithmic_bias_epistemic_injustice.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critical" AND "algorithmic bias")'),
            ("critical_essay_05_decolonizing_global_health_governance.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"decolonizing" AND "global health")'),
            ("critical_essay_06_limits_of_techno_solutionism_climate.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critical analysis" AND "climate policy")'),
            ("critical_essay_07_critique_of_evidence_based_policymaking.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critique" AND "evidence-based policy")'),
            ("critical_essay_08_surveillance_capitalism_autonomy_critique.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"surveillance" AND "data privacy" AND "critical")'),
            ("critical_essay_09_replication_crisis_biomedical_research.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"reproducibility crisis" OR TITLE:"replication crisis")'),
            ("critical_essay_10_post_development_theory_institutional_critique.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"critical perspective" AND "sustainable development")'),
        ]
    },
    "argumentative_essay": {
        "label": "Argumentative Essay",
        "primary_tone": "Persuasive",
        "secondary_tone": "Formal Academic",
        "files": [
            ("argumentative_01_case_for_universal_basic_services.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"the case for" AND ("universal basic" OR "social protection"))'),
            ("argumentative_02_mandatory_open_science_data_sharing.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"why we need" AND "open science")'),
            ("argumentative_03_precautionary_regulation_frontier_ai.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"the case for" AND "artificial intelligence" AND "regulation")'),
            ("argumentative_04_carbon_border_adjustments_trade_equity.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("carbon pricing" AND "argument" AND "equity")'),
            ("argumentative_05_abolishing_for_profit_academic_publishing.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("open access" AND "academic publishing" AND "reform")'),
            ("argumentative_06_sovereign_digital_public_infrastructure.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("digital public infrastructure" AND "governance")'),
            ("argumentative_07_four_day_workweek_macroeconomic_case.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("working hours" AND "productivity" AND "well-being" AND "policy")'),
            ("argumentative_08_intellectual_property_waivers_pandemics.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("TRIPS waiver" OR ("intellectual property" AND "vaccine equity"))'),
            ("argumentative_09_urban_congestion_pricing_equity_debate.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("congestion pricing" AND "equity" AND "urban")'),
            ("argumentative_10_nuclear_baseload_in_decarbonization.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("nuclear energy" AND "decarbonization" AND "transition")'),
        ]
    },
    "policy_analysis": {
        "label": "Policy Analysis",
        "primary_tone": "Analytical",
        "secondary_tone": "Persuasive",
        "files": [
            ("policy_analysis_01_carbon_tax_vs_cap_and_trade_evaluation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"policy analysis" AND ("carbon" OR "emissions"))'),
            ("policy_analysis_02_ai_governance_risk_tier_regulatory_framework.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"regulatory framework" AND "artificial intelligence")'),
            ("policy_analysis_03_universal_health_coverage_financing_options.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"policy analysis" AND "health financing")'),
            ("policy_analysis_04_affordable_housing_zoning_reform_tradeoffs.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"housing policy" AND "urban" AND "evaluation")'),
            ("policy_analysis_05_central_bank_digital_currency_monetary_policy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("monetary policy" AND "digital currency" AND "regulatory")'),
            ("policy_analysis_06_antitrust_digital_platform_interoperability.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("competition policy" AND "digital platforms")'),
            ("policy_analysis_07_antibiotic_stewardship_agricultural_regulation.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"policy" AND "antimicrobial resistance" AND "governance")'),
            ("policy_analysis_08_electric_vehicle_subsidy_fiscal_impact.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"policy" AND "electric vehicles" AND "subsidies")'),
            ("policy_analysis_09_cross_border_data_localization_compliance.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("data governance" AND "regulatory" AND "cross-border")'),
            ("policy_analysis_10_early_childhood_education_subsidy_cost_benefit.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("cost-benefit analysis" AND "early childhood" AND "policy")'),
        ]
    },
    "business_assignment": {
        "label": "Business Assignment",
        "primary_tone": "Analytical",
        "secondary_tone": "Objective",
        "files": [
            ("business_01_strategic_management_dynamic_capabilities.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"dynamic capabilities" AND "competitive advantage")'),
            ("business_02_omni_channel_retail_supply_chain_resilience.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"supply chain resilience" AND "retail")'),
            ("business_03_fintech_disruption_commercial_banking_strategy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"fintech" AND "banking" AND "performance")'),
            ("business_04_mergers_acquisitions_post_integration_synergy.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"mergers and acquisitions" AND "integration")'),
            ("business_05_platform_ecosystem_network_effects_monetization.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"business model" AND "platform" AND "ecosystem")'),
            ("business_06_sustainable_value_chain_esg_financial_performance.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"ESG" AND "financial performance")'),
            ("business_07_agile_transformation_organizational_culture.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND (TITLE:"agile" AND "organizational culture")'),
            ("business_08_b2b_saas_customer_retention_unit_economics.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("customer retention" AND "business-to-business" AND "value")'),
            ("business_09_emerging_market_entry_mode_joint_ventures.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("emerging markets" AND "firm performance" AND "strategy")'),
            ("business_10_corporate_turnaround_working_capital_optimization.json", 'OPEN_ACCESS:Y AND IN_EPMC:Y AND ("working capital" AND "profitability" AND "corporate")'),
        ]
    }
}

def normalize_citations(text: str) -> str:
    text = re.sub(r'\([A-Z][A-Za-z\s,&.\-]+,\s*\d{4}[a-z]?\)', '[1]', text)
    text = re.sub(r'\[\d+(?:\s*[,–-]\s*\d+)*\]', '[1]', text)
    return re.sub(r'\s+', ' ', text).strip()

def fetch_one_valid_paper(query: str, used_pmcids: set, fallback_terms: list = None):
    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    attempt_queries = [query]
    if "AND (" in query:
        attempt_queries.append('OPEN_ACCESS:Y AND IN_EPMC:Y AND (' + query.split('AND (')[-1])
    else:
        attempt_queries.append(f"OPEN_ACCESS:Y AND IN_EPMC:Y AND {query}")
    
    if fallback_terms:
        for term in fallback_terms:
            attempt_queries.append(f'OPEN_ACCESS:Y AND IN_EPMC:Y AND ({term})')
            
    for attempt_query in attempt_queries:
        for page_size in [25, 50]:
            try:
                params = {"query": attempt_query, "resultType": "core", "pageSize": page_size, "format": "json"}
                resp = requests.get(search_url, params=params, timeout=30)
                if resp.status_code != 200:
                    continue
                results = resp.json().get("resultList", {}).get("result", [])
                for item in results:
                    pmcid = item.get("pmcid")
                    if not pmcid or pmcid in used_pmcids:
                        continue
                    xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
                    try:
                        xml_resp = requests.get(xml_url, timeout=25)
                        if xml_resp.status_code != 200:
                            continue
                        soup = BeautifulSoup(xml_resp.text, "lxml-xml")
                        body = soup.find("body")
                        if not body:
                            continue
                        paragraphs = [
                            normalize_citations(p.get_text(" ", strip=True))
                            for p in body.find_all("p")
                            if len(p.get_text(" ", strip=True).split()) >= 30
                        ]
                        full_text = "\n\n".join(paragraphs)
                        word_count = len(full_text.split())
                        if word_count >= 1200:
                            used_pmcids.add(pmcid)
                            return {
                                "pmcid": pmcid,
                                "doi": item.get("doi", "N/A"),
                                "title": item.get("title", "Untitled"),
                                "pubYear": item.get("pubYear", "N/A"),
                                "word_count": word_count,
                                "paragraphs": paragraphs,
                                "full_text": full_text,
                                "sha256": hashlib.sha256(full_text.encode("utf-8")).hexdigest()
                            }
                    except Exception as parse_err:
                        continue
            except Exception as search_err:
                continue

    raise RuntimeError(f"Could not retrieve valid full-text paper for query: {query}")

def main():
    used_pmcids = set()
    manifest = {}
    total_files = sum(len(meta["files"]) for meta in EXACT_90_SPEC.values())
    print(f"Starting download pipeline for {total_files} exact named files across {len(EXACT_90_SPEC)} archetypes...")

    # First, pass through any already-downloaded valid files to avoid duplicate work and keep PMCIDs tracked
    for arch_id, meta in EXACT_90_SPEC.items():
        arch_dir = os.path.join(CORPUS_DIR, arch_id)
        if os.path.exists(arch_dir):
            for filename, _ in meta["files"]:
                target_path = os.path.join(arch_dir, filename)
                if os.path.exists(target_path):
                    try:
                        with open(target_path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if data.get("word_count", 0) >= 1200 and data.get("pmcid"):
                                used_pmcids.add(data["pmcid"])
                    except Exception:
                        pass

    completed_count = 0
    for arch_id, meta in EXACT_90_SPEC.items():
        arch_dir = os.path.join(CORPUS_DIR, arch_id)
        os.makedirs(arch_dir, exist_ok=True)
        manifest[arch_id] = {
            "label": meta["label"],
            "primary_tone": meta["primary_tone"],
            "secondary_tone": meta["secondary_tone"],
            "files": []
        }
        for filename, query in meta["files"]:
            target_path = os.path.join(arch_dir, filename)
            
            # Check if valid file already exists
            if os.path.exists(target_path):
                try:
                    with open(target_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                        if (
                            existing.get("word_count", 0) >= 1200
                            and existing.get("full_text")
                            and existing.get("pmcid")
                        ):
                            completed_count += 1
                            manifest[arch_id]["files"].append({
                                "filename": filename,
                                "path": target_path,
                                "pmcid": existing["pmcid"],
                                "title": existing.get("title", "Untitled"),
                                "word_count": existing["word_count"],
                                "sha256": existing.get("sha256", hashlib.sha256(existing["full_text"].encode("utf-8")).hexdigest())
                            })
                            print(f"[{completed_count}/{total_files}] (Cached) [{arch_id}] -> {filename} ({existing['word_count']} words, PMCID: {existing['pmcid']})")
                            continue
                except Exception:
                    pass

            fallback_terms = [
                meta["label"].lower(),
                arch_id.replace("_", " "),
                filename.replace(".json", "").replace("_", " ")
            ]
            print(f"[{completed_count + 1}/{total_files}] Downloading [{arch_id}] -> {filename} ...")
            paper = fetch_one_valid_paper(query, used_pmcids, fallback_terms)
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

            completed_count += 1
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
    print("\nALL 90 EXACT NAMED FILES DOWNLOADED AND LOGGED TO MANIFEST.")

if __name__ == "__main__":
    main()
