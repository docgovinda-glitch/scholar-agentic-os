import os
import sys
import json
import hashlib
from collections import defaultdict

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CORPUS_DIR = os.path.join(BASE_DIR, "corpus")
MANIFEST_PATH = os.path.join(BASE_DIR, "corpus_manifest.json")

EXPECTED_SPEC = {
    "essay": [
        "essay_01_higher_education_pedagogy.json",
        "essay_02_epistemology_scientific_inquiry.json",
        "essay_03_ethics_of_artificial_intelligence.json",
        "essay_04_climate_justice_global_south.json",
        "essay_05_digital_public_sphere_democracy.json",
        "essay_06_public_health_social_determinants.json",
        "essay_07_urbanization_sustainable_cities.json",
        "essay_08_behavioral_economics_rationality.json",
        "essay_09_cultural_globalization_identity.json",
        "essay_10_future_of_work_automation.json",
    ],
    "literature_review": [
        "lit_review_01_prisma_systematic_review_ai_education.json",
        "lit_review_02_scoping_review_digital_mental_health.json",
        "lit_review_03_bibliometric_review_sustainable_finance.json",
        "lit_review_04_integrative_review_organizational_resilience.json",
        "lit_review_05_umbrella_review_public_health_interventions.json",
        "lit_review_06_systematic_review_supply_chain_risk.json",
        "lit_review_07_narrative_synthesis_remote_work_productivity.json",
        "lit_review_08_meta_synthesis_technology_adoption_models.json",
        "lit_review_09_state_of_the_art_large_language_models.json",
        "lit_review_10_critical_review_circular_economy_metrics.json",
    ],
    "research_paper": [
        "research_paper_01_empirical_rct_educational_outcomes.json",
        "research_paper_02_longitudinal_cohort_economic_mobility.json",
        "research_paper_03_cross_sectional_survey_consumer_trust.json",
        "research_paper_04_mixed_methods_healthcare_accessibility.json",
        "research_paper_05_econometric_panel_renewable_energy.json",
        "research_paper_06_experimental_study_cognitive_load.json",
        "research_paper_07_quasi_experimental_urban_transport.json",
        "research_paper_08_computational_benchmark_nlp_reasoning.json",
        "research_paper_09_multivariate_analysis_fintech_adoption.json",
        "research_paper_10_epidemiological_modeling_air_quality.json",
    ],
    "case_study": [
        "case_study_01_national_digital_payment_infrastructure.json",
        "case_study_02_hospital_lean_management_transformation.json",
        "case_study_03_municipal_zero_waste_implementation.json",
        "case_study_04_post_disaster_supply_chain_recovery.json",
        "case_study_05_university_blended_learning_transition.json",
        "case_study_06_smart_grid_microgrid_rural_electrification.json",
        "case_study_07_corporate_esg_governance_restructuring.json",
        "case_study_08_public_sector_agile_software_delivery.json",
        "case_study_09_community_based_ecotourism_conservation.json",
        "case_study_10_cross_border_e_commerce_logistics.json",
    ],
    "report": [
        "report_01_global_disease_burden_surveillance_report.json",
        "report_02_environmental_impact_assessment_watershed.json",
        "report_03_national_cybersecurity_readiness_audit.json",
        "report_04_renewable_energy_grid_integration_technical_report.json",
        "report_05_workforce_demographics_labor_market_report.json",
        "report_06_pharmacovigilance_safety_monitoring_report.json",
        "report_07_agricultural_yield_climate_vulnerability_report.json",
        "report_08_public_transit_infrastructure_feasibility_report.json",
        "report_09_higher_education_quality_assurance_audit.json",
        "report_10_digital_financial_inclusion_index_report.json",
    ],
    "critical_essay": [
        "critical_essay_01_critique_of_neoliberal_higher_education.json",
        "critical_essay_02_methodological_flaws_in_social_psychology.json",
        "critical_essay_03_rethinking_gdp_as_welfare_indicator.json",
        "critical_essay_04_algorithmic_bias_epistemic_injustice.json",
        "critical_essay_05_decolonizing_global_health_governance.json",
        "critical_essay_06_limits_of_techno_solutionism_climate.json",
        "critical_essay_07_critique_of_evidence_based_policymaking.json",
        "critical_essay_08_surveillance_capitalism_autonomy_critique.json",
        "critical_essay_09_replication_crisis_biomedical_research.json",
        "critical_essay_10_post_development_theory_institutional_critique.json",
    ],
    "argumentative_essay": [
        "argumentative_01_case_for_universal_basic_services.json",
        "argumentative_02_mandatory_open_science_data_sharing.json",
        "argumentative_03_precautionary_regulation_frontier_ai.json",
        "argumentative_04_carbon_border_adjustments_trade_equity.json",
        "argumentative_05_abolishing_for_profit_academic_publishing.json",
        "argumentative_06_sovereign_digital_public_infrastructure.json",
        "argumentative_07_four_day_workweek_macroeconomic_case.json",
        "argumentative_08_intellectual_property_waivers_pandemics.json",
        "argumentative_09_urban_congestion_pricing_equity_debate.json",
        "argumentative_10_nuclear_baseload_in_decarbonization.json",
    ],
    "policy_analysis": [
        "policy_analysis_01_carbon_tax_vs_cap_and_trade_evaluation.json",
        "policy_analysis_02_ai_governance_risk_tier_regulatory_framework.json",
        "policy_analysis_03_universal_health_coverage_financing_options.json",
        "policy_analysis_04_affordable_housing_zoning_reform_tradeoffs.json",
        "policy_analysis_05_central_bank_digital_currency_monetary_policy.json",
        "policy_analysis_06_antitrust_digital_platform_interoperability.json",
        "policy_analysis_07_antibiotic_stewardship_agricultural_regulation.json",
        "policy_analysis_08_electric_vehicle_subsidy_fiscal_impact.json",
        "policy_analysis_09_cross_border_data_localization_compliance.json",
        "policy_analysis_10_early_childhood_education_subsidy_cost_benefit.json",
    ],
    "business_assignment": [
        "business_01_strategic_management_dynamic_capabilities.json",
        "business_02_omni_channel_retail_supply_chain_resilience.json",
        "business_03_fintech_disruption_commercial_banking_strategy.json",
        "business_04_mergers_acquisitions_post_integration_synergy.json",
        "business_05_platform_ecosystem_network_effects_monetization.json",
        "business_06_sustainable_value_chain_esg_financial_performance.json",
        "business_07_agile_transformation_organizational_culture.json",
        "business_08_b2b_saas_customer_retention_unit_economics.json",
        "business_09_emerging_market_entry_mode_joint_ventures.json",
        "business_10_corporate_turnaround_working_capital_optimization.json",
    ],
    "journal_article": [
        "journal_01_q1_imrad_clinical_trial_methodology.json",
        "journal_02_q1_computational_machine_learning_architecture.json",
        "journal_03_q1_econometric_causal_inference_panel.json",
        "journal_04_q1_molecular_biology_experimental_protocol.json",
        "journal_05_q1_environmental_science_geospatial_modeling.json",
        "journal_06_q1_cognitive_neuroscience_behavioral_paradigm.json",
        "journal_07_q1_materials_engineering_characterization.json",
        "journal_08_q1_public_health_epidemiological_surveillance.json",
        "journal_09_q1_information_systems_design_science.json",
        "journal_10_q1_quantitative_sociology_network_analysis.json",
    ],
    "presentation_slides": [
        "presentation_01_visual_communication_scientific_presentations.json",
        "presentation_02_cognitive_load_multimedia_slide_design.json",
        "presentation_03_data_visualization_graphical_perception.json",
        "presentation_04_assertion_evidence_slide_structure.json",
        "presentation_05_scientific_storytelling_narrative_arc.json",
        "presentation_06_poster_and_short_talk_visual_abstracts.json",
        "presentation_07_executive_briefing_decision_oriented_decks.json",
        "presentation_08_accessible_typography_color_contrast_slides.json",
        "presentation_09_interactive_teaching_lectures_active_recall.json",
        "presentation_10_defense_viva_voce_research_pitch_structure.json",
    ]
}

def verify_corpus():
    print("=" * 80)
    print("FILE-BY-FILE AUDIT & VERIFICATION OF EXACT 110-FILE CORPUS (OT-01, OT-10, OT-22)")
    print("=" * 80)

    errors = []
    warnings = []
    
    seen_pmcids = {}
    seen_hashes = {}
    seen_filenames = set()
    
    total_words = 0
    words_by_archetype = defaultdict(list)
    verified_files = []

    for arch_id, expected_files in EXPECTED_SPEC.items():
        arch_dir = os.path.join(CORPUS_DIR, arch_id)
        if not os.path.exists(arch_dir):
            errors.append(f"Missing archetype directory: {arch_dir}")
            continue

        actual_files = set(os.listdir(arch_dir))
        
        for expected_filename in expected_files:
            file_path = os.path.join(arch_dir, expected_filename)
            if not os.path.exists(file_path):
                errors.append(f"Missing required file: [{arch_id}] -> {expected_filename}")
                continue
            
            seen_filenames.add(expected_filename)

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                errors.append(f"Invalid JSON in {file_path}: {e}")
                continue

            # Field checks
            required_fields = ["target_filename", "archetype_id", "assignment_type", "primary_tone", "secondary_tone", "pmcid", "word_count", "full_text", "paragraphs", "sha256"]
            missing_fields = [f for f in required_fields if f not in data]
            if missing_fields:
                errors.append(f"{expected_filename}: Missing fields {missing_fields}")

            # Word count check (> 1200 words)
            wc = data.get("word_count", 0)
            actual_text = data.get("full_text", "")
            computed_wc = len(actual_text.split())
            if wc < 1200:
                errors.append(f"{expected_filename}: Word count {wc} < 1200 threshold.")
            if abs(wc - computed_wc) > 50:
                warnings.append(f"{expected_filename}: Stored wc ({wc}) vs computed wc ({computed_wc}) mismatch.")

            # PMCID uniqueness check
            pmcid = data.get("pmcid", "")
            if not pmcid or not pmcid.startswith("PMC"):
                errors.append(f"{expected_filename}: Invalid PMCID '{pmcid}'")
            elif pmcid in seen_pmcids:
                errors.append(f"{expected_filename}: Duplicate PMCID '{pmcid}' previously seen in {seen_pmcids[pmcid]}")
            else:
                seen_pmcids[pmcid] = expected_filename

            # SHA256 integrity & uniqueness
            computed_sha = hashlib.sha256(actual_text.encode("utf-8")).hexdigest()
            stored_sha = data.get("sha256", "")
            if computed_sha != stored_sha:
                errors.append(f"{expected_filename}: SHA256 hash mismatch. Stored: {stored_sha[:10]}..., Computed: {computed_sha[:10]}...")
            
            if computed_sha in seen_hashes:
                errors.append(f"{expected_filename}: Identical content hash with {seen_hashes[computed_sha]}")
            else:
                seen_hashes[computed_sha] = expected_filename

            # Paragraphs check
            paras = data.get("paragraphs", [])
            if not isinstance(paras, list) or len(paras) < 3:
                errors.append(f"{expected_filename}: Insufficient paragraphs ({len(paras)} paragraphs).")

            total_words += computed_wc
            words_by_archetype[arch_id].append(computed_wc)
            verified_files.append((arch_id, expected_filename, pmcid, computed_wc))

    # Print Archetype Breakdown Table
    print("\nARCHETYPE BREAKDOWN TABLE:")
    print("-" * 80)
    print(f"{'Archetype':<24} | {'Files':<6} | {'Min W':<8} | {'Max W':<8} | {'Mean W':<8} | {'Total W':<10}")
    print("-" * 80)
    for arch_id, w_list in words_by_archetype.items():
        if w_list:
            min_w = min(w_list)
            max_w = max(w_list)
            mean_w = int(sum(w_list) / len(w_list))
            tot_w = sum(w_list)
            print(f"{arch_id:<24} | {len(w_list):<6} | {min_w:<8} | {max_w:<8} | {mean_w:<8} | {tot_w:<10}")
        else:
            print(f"{arch_id:<24} | 0      | N/A      | N/A      | N/A      | 0")
    print("-" * 80)
    print(f"TOTAL VERIFIED FILES: {len(verified_files)} / 110")
    print(f"TOTAL CORPUS WORDS:   {total_words:,} words")
    print(f"UNIQUE PMCIDs:        {len(seen_pmcids)} / 110")
    print(f"UNIQUE SHA256 HASHES: {len(seen_hashes)} / 110")
    print("=" * 80)

    if warnings:
        print(f"\nWARNINGS ({len(warnings)}):")
        for w in warnings[:10]:
            print(f"  [!] {w}")

    if errors:
        print(f"\nAUDIT FAILED WITH {len(errors)} ERRORS:")
        for err in errors[:25]:
            print(f"  [X] {err}")
        return False
    else:
        print("\nSUCCESS: All 110 exact named files verified with 100% compliance!")
        return True

if __name__ == "__main__":
    success = verify_corpus()
    sys.exit(0 if success else 1)
