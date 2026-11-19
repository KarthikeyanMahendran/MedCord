package com.medcord.copilot;

import com.medcord.safety.PhiDetector;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Produces structured, clinically formatted Markdown from de-identified discussion context.
 * Acts as the zero-config clinical synthesis engine when no external LLM key is set (or as an offline hospital fallback).
 */
public final class ClinicalSynthesizer {
    private ClinicalSynthesizer() {}

    public enum Mode { SUMMARIZE, HANDOFF, DIFFERENTIAL, ASK }

    public record ContextItem(String authorName, String specialty, String text) {}

    private static final Pattern VITALS_RE = Pattern.compile(
        "\\b(?:BP\\s*\\d{2,3}/\\d{2,3}|HR\\s*\\d{2,3}|SpO2\\s*\\d{2,3}%?|RR\\s*\\d{1,2}|Temp\\s*\\d{2,3}(?:\\.\\d)?|ECG|EKG|Troponin|BNP|Lactate|WBC|CRP|HbA1c|Cr\\s*\\d(?:\\.\\d)?|K\\+\\s*\\d(?:\\.\\d)?)\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern CLINICAL_TERMS_RE = Pattern.compile(
        "\\b(?:chest pain|dyspnea|shortness of breath|syncope|tachycardia|bradycardia|ST[- ]?elevation|STEMI|NSTEMI|AFib|atrial fibrillation|sepsis|pneumonia|PE|pulmonary embolism|stroke|TIA|hypertension|hypotension|hypoxia|fever|headache|abdominal pain|rash|anemia|AKI|heart failure|asthma|COPD|diabetes|DKA|anticoagul\\w+|heparin|aspirin|amiodarone|metoprolol|vancomycin|ceftriaxone|steroid|CT|MRI|X-ray|ultrasound|echo|cath lab|biopsy|protocol)\\b",
        Pattern.CASE_INSENSITIVE
    );

    public static String synthesize(Mode mode, String channelName, String prompt, List<ContextItem> rawContext) {
        List<ContextItem> cleanContext = rawContext.stream()
            .map(c -> new ContextItem(c.authorName(), c.specialty(), PhiDetector.redact(c.text())))
            .filter(c -> c.text() != null && !c.text().isBlank())
            .toList();

        String cleanPrompt = prompt == null ? "" : PhiDetector.redact(prompt.trim());
        LinkedHashSet<String> speakers = new LinkedHashSet<>();
        LinkedHashSet<String> vitalsAndLabs = new LinkedHashSet<>();
        LinkedHashSet<String> clinicalTerms = new LinkedHashSet<>();
        List<String> questions = new ArrayList<>();
        List<String> recentPoints = new ArrayList<>();

        for (ContextItem item : cleanContext) {
            speakers.add(item.specialty() != null && !item.specialty().isBlank()
                ? item.authorName() + " (" + item.specialty() + ")"
                : item.authorName());
            Matcher vm = VITALS_RE.matcher(item.text());
            while (vm.find() && vitalsAndLabs.size() < 8) vitalsAndLabs.add(vm.group().trim());
            Matcher cm = CLINICAL_TERMS_RE.matcher(item.text());
            while (cm.find() && clinicalTerms.size() < 10) clinicalTerms.add(cm.group().trim());
            if (item.text().contains("?")) {
                questions.add(trimExcerpt(item.text(), 140));
            }
            recentPoints.add("**" + item.authorName() + ":** " + trimExcerpt(item.text(), 160));
        }

        StringBuilder out = new StringBuilder();
        switch (mode) {
            case SUMMARIZE -> buildSummary(out, channelName, cleanContext.size(), speakers, vitalsAndLabs, clinicalTerms, questions, recentPoints);
            case HANDOFF -> buildHandoff(out, channelName, speakers, vitalsAndLabs, clinicalTerms, questions, recentPoints);
            case DIFFERENTIAL -> buildDifferential(out, channelName, cleanPrompt, vitalsAndLabs, clinicalTerms);
            case ASK -> buildAsk(out, channelName, cleanPrompt, vitalsAndLabs, clinicalTerms, recentPoints);
        }

        out.append("\n> **Clinical Decision-Support Notice:** Generated from de-identified discussion context (PHI scrubbed automatically). Verify against institutional protocols and bedside assessment.");
        return out.toString();
    }

    private static void buildSummary(StringBuilder out, String channelName, int count,
                                     Set<String> speakers, Set<String> vitals, Set<String> terms,
                                     List<String> questions, List<String> points) {
        out.append("### Clinical Case Summary — `#").append(channelName).append("`\n\n");
        if (count == 0) {
            out.append("No recent clinical messages were found in this conversation yet. Post de-identified case notes or voice transcripts and invoke Co-Pilot again.\n");
            return;
        }
        out.append("**Scope:** Synthesized from ").append(count).append(" recent de-identified message")
            .append(count == 1 ? "" : "s").append(" · **Contributors:** ")
            .append(String.join(", ", speakers)).append("\n\n");

        if (!terms.isEmpty() || !vitals.isEmpty()) {
            out.append("| Signal Category | Extracted Findings |\n|---|---|\n");
            if (!terms.isEmpty()) {
                out.append("| Key Clinical Concepts | ").append(String.join(", ", terms)).append(" |\n");
            }
            if (!vitals.isEmpty()) {
                out.append("| Vitals / Labs / Diagnostics | ").append(String.join(", ", vitals)).append(" |\n");
            }
            out.append("\n");
        }

        out.append("**Discussion Highlights:**\n");
        int start = Math.max(0, points.size() - 5);
        for (int i = start; i < points.size(); i++) {
            out.append("- ").append(points.get(i)).append("\n");
        }

        if (!questions.isEmpty()) {
            out.append("\n**Open Clinical Questions:**\n");
            int qStart = Math.max(0, questions.size() - 3);
            for (int i = qStart; i < questions.size(); i++) {
                out.append("- ").append(questions.get(i)).append("\n");
            }
        }
    }

    private static void buildHandoff(StringBuilder out, String channelName, Set<String> speakers,
                                     Set<String> vitals, Set<String> terms, List<String> questions, List<String> points) {
        out.append("### SBAR Shift Handoff — `#").append(channelName).append("`\n\n");
        out.append("| SBAR | Summary |\n|---|---|\n");
        out.append("| **S — Situation** | Active consult thread in `#").append(channelName).append("`")
            .append(terms.isEmpty() ? " (awaiting primary clinical chief complaint)" : " involving **" + String.join(", ", limit(terms, 4)) + "**")
            .append(" |\n");
        out.append("| **B — Background** | Contributors: ")
            .append(speakers.isEmpty() ? "Care team" : String.join(", ", speakers))
            .append(vitals.isEmpty() ? "" : " · Notable data: " + String.join(", ", vitals))
            .append(" |\n");
        out.append("| **A — Assessment** | ")
            .append(points.isEmpty() ? "No clinical updates logged yet." : escapePipe(points.get(points.size() - 1)))
            .append(" |\n");
        out.append("| **R — Recommendation** | ")
            .append(questions.isEmpty()
                ? "Confirm diagnostic follow-up, reconcile medications, and document escalation triggers."
                : "Address open team question: " + escapePipe(questions.get(questions.size() - 1)))
            .append(" |\n");
    }

    private static void buildDifferential(StringBuilder out, String channelName, String prompt,
                                          Set<String> vitals, Set<String> terms) {
        out.append("### Differential & Workup Checklist — `#").append(channelName).append("`\n\n");
        if (!prompt.isBlank()) {
            out.append("**Focus:** ").append(prompt).append("\n\n");
        }
        String joined = (String.join(" ", terms) + " " + String.join(" ", vitals) + " " + prompt).toLowerCase(Locale.ROOT);
        boolean cardiac = joined.contains("chest") || joined.contains("stemi") || joined.contains("troponin") || joined.contains("ecg") || joined.contains("ekg") || joined.contains("afib") || joined.contains("cardio");
        boolean resp = joined.contains("dyspnea") || joined.contains("hypoxia") || joined.contains("spo2") || joined.contains("pneumonia") || joined.contains("pe") || joined.contains("asthma");
        boolean neuro = joined.contains("stroke") || joined.contains("tia") || joined.contains("headache") || joined.contains("syncope");
        boolean sepsis = joined.contains("sepsis") || joined.contains("fever") || joined.contains("lactate") || joined.contains("hypotension");

        out.append("**Can't-Miss Differentials to Rule Out:**\n");
        if (cardiac) {
            out.append("- Acute Coronary Syndrome (STEMI / NSTEMI) — serial high-sensitivity troponins & 12-lead ECG\n");
            out.append("- Acute Aortic Dissection / Pulmonary Embolism — risk-stratify with Wells/PERC & CT angiography if indicated\n");
            out.append("- Arrhythmia / Acute Decompensated Heart Failure — continuous telemetry, BNP, bedside echo\n");
        } else if (resp) {
            out.append("- Pulmonary Embolism vs. Acute Heart Failure — Wells score, D-dimer/CTPA, BNP, point-of-care ultrasound\n");
            out.append("- Severe Community/Hospital-Acquired Pneumonia — CXR, procalcitonin, sputum/blood cultures\n");
            out.append("- Acute Bronchospasm / Tension Pneumothorax — bedside lung US, ABG/VBG\n");
        } else if (neuro) {
            out.append("- Acute Ischemic vs. Hemorrhagic Stroke — immediate non-contrast CT head, NIHSS, last-known-well time\n");
            out.append("- Subarachnoid Hemorrhage / Meningitis — CT/LP if thunderclap or febrile\n");
            out.append("- Metabolic / Cardiac Syncope — fingerstick glucose, 12-lead ECG, orthostatics\n");
        } else if (sepsis) {
            out.append("- Sepsis / Septic Shock — lactate, 2x blood cultures prior to empiric broad-spectrum antibiotics, fluid resuscitation\n");
            out.append("- Occult Source Control — urinalysis, CXR, abdominal imaging as guided by exam\n");
        } else {
            out.append("- Life-threatening cardiopulmonary / vascular causes relevant to current presentation\n");
            out.append("- Infectious, metabolic, or medication-induced etiologies\n");
            out.append("- Organ-specific pathology aligned with specialty discussion")
                .append(terms.isEmpty() ? "" : " (" + String.join(", ", limit(terms, 5)) + ")").append("\n");
        }

        out.append("\n**Immediate Workup Checklist:**\n");
        out.append("- Verify hemodynamic stability (ABCDE) and trend serial vitals\n");
        out.append("- Review baseline labs, renal/hepatic function, and allergies before ordering contrast or therapy\n");
        out.append("- Confirm clear escalation criteria and specialty consult owner in-thread\n");
    }

    private static void buildAsk(StringBuilder out, String channelName, String prompt,
                                 Set<String> vitals, Set<String> terms, List<String> points) {
        out.append("### Clinical Co-Pilot Response\n\n");
        if (!prompt.isBlank()) {
            out.append("**Query:** ").append(prompt).append("\n\n");
        }
        out.append("**Channel Context (`#").append(channelName).append("`):**\n");
        if (!terms.isEmpty()) {
            out.append("- **Active clinical topics:** ").append(String.join(", ", terms)).append("\n");
        }
        if (!vitals.isEmpty()) {
            out.append("- **Referenced labs/vitals:** ").append(String.join(", ", vitals)).append("\n");
        }
        if (!points.isEmpty()) {
            out.append("- **Most recent update:** ").append(points.get(points.size() - 1)).append("\n");
        }
        out.append("\n**Structured Guidance:**\n");
        out.append("- Cross-check patient-specific contraindications, renal dosing, and local antibiogram/formulary guidelines.\n");
        out.append("- Consider pinning the final consensus protocol or bookmarking key reference pearls for the shift team.\n");
        out.append("- *Tip: Configure `COPILOT_API_URL` and `COPILOT_API_KEY` in `.env` to back this live stream with an external medical LLM.*\n");
    }

    public static List<String> chunkTokens(String markdown) {
        if (markdown == null || markdown.isEmpty()) return List.of();
        List<String> chunks = new ArrayList<>();
        // Stream cleanly in natural 24-40 character bursts preserving newlines & markdown tokens
        int i = 0;
        while (i < markdown.length()) {
            int end = Math.min(markdown.length(), i + 32);
            if (end < markdown.length()) {
                int space = markdown.indexOf(' ', end);
                int nl = markdown.indexOf('\n', end);
                int boundary = -1;
                if (space >= 0 && space - end <= 14) boundary = space + 1;
                if (nl >= 0 && nl - end <= 14 && (boundary < 0 || nl < boundary)) boundary = nl + 1;
                if (boundary > i) end = boundary;
            }
            chunks.add(markdown.substring(i, end));
            i = end;
        }
        return chunks;
    }

    private static List<String> limit(Set<String> set, int max) {
        return set.stream().limit(max).toList();
    }

    private static String trimExcerpt(String s, int max) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max) + "…";
    }

    private static String escapePipe(String s) {
        return s.replace("|", "\\|");
    }
}
