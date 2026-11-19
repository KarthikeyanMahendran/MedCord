package com.medcord.safety;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fast, deterministic pre-send PHI (Protected Health Information) & restricted-term scanner/redactor.
 * Detects common patient identifiers (MRN/UHID, SSN/Aadhaar, DOB, phone numbers, emails, patient names,
 * bed/room identifiers, and community-defined restricted terms) without persisting raw PHI values.
 */
public final class PhiDetector {
    private PhiDetector() {}

    public record Finding(String category, String label, int start, int end, String replacement) {}

    public record ScanResult(boolean hasPhi, List<Finding> findings, List<String> categories, String redactedText) {}

    private record Rule(String category, String label, Pattern pattern, String replacement) {}

    private static final List<Rule> RULES = List.of(
        // Medical record / chart / patient ID numbers
        new Rule(
            "MRN_ID",
            "Medical Record / Patient ID",
            Pattern.compile("\\b(?:MRN|UHID|Medical\\s+Record(?:\\s+No\\.?|\\s*#)?|Patient\\s+ID|Chart\\s*#?)\\s*[:#\\-]?\\s*[A-Z0-9\\-]{4,16}\\b", Pattern.CASE_INSENSITIVE),
            "[MRN REDACTED]"
        ),
        // US SSN (123-45-6789)
        new Rule(
            "NATIONAL_ID",
            "SSN / National ID",
            Pattern.compile("\\b\\d{3}-\\d{2}-\\d{4}\\b"),
            "[ID REDACTED]"
        ),
        // Indian Aadhaar (12 digits grouped 4-4-4)
        new Rule(
            "NATIONAL_ID",
            "Aadhaar / National ID",
            Pattern.compile("\\b[2-9]\\d{3}[\\s-]\\d{4}[\\s-]\\d{4}\\b"),
            "[ID REDACTED]"
        ),
        // Date of Birth (explicit DOB / Date of Birth / Born cue + date)
        new Rule(
            "DOB",
            "Date of Birth",
            Pattern.compile("\\b(?:DOB|Date\\s+of\\s+Birth|D\\.O\\.B\\.?)\\s*[:\\-]?\\s*(?:\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4}|\\d{4}[/\\-.]\\d{1,2}[/\\-.]\\d{1,2}|\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+\\d{2,4})\\b", Pattern.CASE_INSENSITIVE),
            "[DOB REDACTED]"
        ),
        // Email addresses
        new Rule(
            "EMAIL",
            "Email address",
            Pattern.compile("\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b"),
            "[EMAIL REDACTED]"
        ),
        // Phone numbers (international, US, or Indian 10-digit with separators or +country prefix)
        new Rule(
            "PHONE",
            "Phone number",
            Pattern.compile("(?:(?<!\\d)\\+\\d{1,3}[\\s.-]?(?:\\(\\d{2,4}\\)|\\d{2,4})[\\s.-]?\\d{3,4}[\\s.-]?\\d{3,4}(?!\\d)|(?<!\\d)\\(\\d{3}\\)[\\s.-]?\\d{3}[\\s.-]?\\d{4}(?!\\d)|(?<!\\d)\\d{3}[\\s.-]\\d{3}[\\s.-]\\d{4}(?!\\d)|\\b(?:phone|ph|tel|mob|mobile|cell)\\s*[:#\\-]?\\s*\\+?\\d[\\d\\s().\\-]{7,15}\\d\\b)", Pattern.CASE_INSENSITIVE),
            "[PHONE REDACTED]"
        ),
        // Explicit patient name cues ("Patient: John Doe", "Pt: Jane Smith", "Mr./Mrs./Ms. John Doe") — never matches "Dr."
        new Rule(
            "PATIENT_NAME",
            "Patient name",
            Pattern.compile("\\b(?:Patient|Pt\\.?)\\s*[:\\-]\\s*[A-Z][a-z]{1,20}(?:\\s+[A-Z][a-z]{1,20}){1,2}\\b"),
            "Patient: [NAME REDACTED]"
        ),
        new Rule(
            "PATIENT_NAME",
            "Patient name",
            Pattern.compile("\\b(?:Mr|Mrs|Ms|Miss)\\.\\s+[A-Z][a-z]{1,20}\\s+[A-Z][a-z]{1,20}\\b"),
            "[PATIENT NAME REDACTED]"
        ),
        // Bed / Room / Ward identifiers
        new Rule(
            "BED_ROOM",
            "Bed / Room number",
            Pattern.compile("\\b(?:Bed|Room|Rm\\.?)\\s*#?\\s*\\d{1,4}[A-Z]?(?:\\s*,?\\s*Ward\\s+[A-Z0-9\\-]+)?\\b", Pattern.CASE_INSENSITIVE),
            "[ROOM/BED REDACTED]"
        )
    );

    public static ScanResult scan(String text) {
        return scan(text, List.of());
    }

    public static ScanResult scan(String text, Collection<String> blockedTerms) {
        if (text == null || text.isBlank()) {
            return new ScanResult(false, List.of(), List.of(), text == null ? "" : text);
        }

        List<Finding> raw = new ArrayList<>();
        for (Rule r : RULES) {
            Matcher m = r.pattern().matcher(text);
            while (m.find()) {
                raw.add(new Finding(r.category(), r.label(), m.start(), m.end(), r.replacement()));
            }
        }

        if (blockedTerms != null) {
            for (String term : blockedTerms) {
                if (term == null || term.isBlank()) continue;
                Pattern p = Pattern.compile("(?i)(?<!\\w)" + Pattern.quote(term.trim()) + "(?!\\w)");
                Matcher m = p.matcher(text);
                while (m.find()) {
                    raw.add(new Finding("RESTRICTED_TERM", "Restricted term", m.start(), m.end(), "[REDACTED]"));
                }
            }
        }

        if (raw.isEmpty()) {
            return new ScanResult(false, List.of(), List.of(), text);
        }

        // Sort by start ascending, then longest match first; drop overlapping spans.
        raw.sort(Comparator.comparingInt(Finding::start).thenComparingInt(f -> -(f.end() - f.start())));
        List<Finding> merged = new ArrayList<>();
        int cursor = -1;
        for (Finding f : raw) {
            if (f.start() >= cursor) {
                merged.add(f);
                cursor = f.end();
            }
        }

        StringBuilder redacted = new StringBuilder(text.length());
        int pos = 0;
        LinkedHashSet<String> cats = new LinkedHashSet<>();
        for (Finding f : merged) {
            redacted.append(text, pos, f.start());
            redacted.append(f.replacement());
            pos = f.end();
            cats.add(f.category());
        }
        redacted.append(text, pos, text.length());

        return new ScanResult(true, List.copyOf(merged), List.copyOf(cats), redacted.toString());
    }

    public static String redact(String text) {
        return scan(text).redactedText();
    }
}
