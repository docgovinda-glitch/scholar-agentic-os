import os
import re

STAGE_ORDER = [
  "definition", "literature", "gap_identification", "gap_selection",
  "title_selection", "title_lock", "vault_sources", "source_approval_vault",
  "additional_data", "evidence_extraction", "external_research",
  "source_approval_external", "evidence_analysis", "manual_review",
  "journal_discovery", "journal_requirements", "draft", "citation_audit",
  "originality_check", "draft_preview", "peer_review", "revision",
  "final_editor", "publication_readiness", "export"
]

STAGE_FILE_MAPPING = {
  "DefinitionStage.tsx": "definition",
  "LiteratureStage.tsx": "literature",
  "GapIdentificationStage.tsx": "gap_identification",
  "GapSelectionStage.tsx": "gap_selection",
  "TitleSelectionStage.tsx": "title_selection",
  "TitleLockStage.tsx": "title_lock",
  "VaultSourcesStage.tsx": "vault_sources",
  "AdditionalDataStage.tsx": "additional_data",
  "EvidenceExtractionStage.tsx": "evidence_extraction",
  "ExternalResearchStage.tsx": "external_research",
  "EvidenceAnalysisStage.tsx": "evidence_analysis",
  "ManualReviewStage.tsx": "manual_review",
  "JournalDiscoveryStage.tsx": "journal_discovery",
  "JournalRequirementsStage.tsx": "journal_requirements",
  "DraftStage.tsx": "draft",
  "CitationAuditStage.tsx": "citation_audit",
  "OriginalityCheckStage.tsx": "originality_check",
  "DraftPreviewStage.tsx": "draft_preview",
  "PeerReviewStage.tsx": "peer_review",
  "RevisionStage.tsx": "revision",
  "FinalEditorStage.tsx": "final_editor",
  "PublicationReadinessStage.tsx": "publication_readiness",
  "ExportStage.tsx": "export"
}

stages_dir = "src/desk/workspace/stages"

for filename in os.listdir(stages_dir):
    if not filename.endswith(".tsx"):
        continue
    
    filepath = os.path.join(stages_dir, filename)
    with open(filepath, "r") as f:
        content = f.read()

    # Special handling for SourceApprovalStage.tsx because it's used for multiple stages
    if filename == "SourceApprovalStage.tsx":
        # It has `stage: ResearchStage;`
        content = re.sub(r'onAdvance\?:\s*\(\)\s*=>\s*void;', 'onAdvance?: (stage: string) => void;', content)
        # Find where it calls onAdvance() or onAdvance?.()
        # We need to compute the next stage dynamically inside the file.
        # Let's replace the `onAdvance()` call with a dynamic lookup.
        # But wait, we can just let `onAdvance(stage === "source_approval_vault" ? "additional_data" : "evidence_analysis")`
        content = content.replace("onAdvance?.()", 'onAdvance?.(stage === "source_approval_vault" ? "additional_data" : "evidence_analysis")')
        content = content.replace("onAdvance()", 'onAdvance(stage === "source_approval_vault" ? "additional_data" : "evidence_analysis")')
        
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Fixed {filename}")
        continue
        
    if filename not in STAGE_FILE_MAPPING:
        continue

    current_stage = STAGE_FILE_MAPPING[filename]
    try:
        idx = STAGE_ORDER.index(current_stage)
        if idx + 1 < len(STAGE_ORDER):
            next_stage = STAGE_ORDER[idx + 1]
        else:
            next_stage = "export" # fallback
    except ValueError:
        continue

    # 1. Fix the type definition
    content = re.sub(r'onAdvance\?:\s*\(\)\s*=>\s*void;', 'onAdvance?: (stage: string) => void;', content)
    
    # 2. Fix the invocation
    # We might have `onAdvance()` or `onAdvance?.()` or `onClick={onAdvance}`
    # Wait, `onClick={onAdvance}` passes a React event! Which means the stage would be an object instead of a string!
    # Let's fix `onClick={onAdvance}` first.
    content = re.sub(r'onClick=\{onAdvance\}', f'onClick={{() => onAdvance?.("{next_stage}")}}', content)
    
    content = content.replace("onAdvance?.()", f'onAdvance?.("{next_stage}")')
    content = content.replace("onAdvance()", f'onAdvance("{next_stage}")')
    
    with open(filepath, "w") as f:
        f.write(content)
    
    print(f"Fixed {filename} -> next: {next_stage}")

print("Done!")
