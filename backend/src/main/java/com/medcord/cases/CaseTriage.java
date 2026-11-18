package com.medcord.cases;

import com.medcord.cases.CaseDtos.RedFlag;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Deterministic triage: red-flag keyword rules (from red_flag_rules), vitals thresholds and
 * specialty routing (from specialties). It only flags and escalates; it never diagnoses.
 */
@Service
public class CaseTriage {
    public record Result(String urgency, List<RedFlag> flags, String specialty, Map<String, Object> sbar) {}

    private final JdbcClient jdbc;

    public CaseTriage(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Result assess(String complaint, Integer age, String sex, String village, Map<String, Object> vitals) {
        String text = (complaint == null ? "" : complaint).toLowerCase(Locale.ROOT);
        List<Map<String, Object>> rules = jdbc.sql(
            "SELECT code, label, advice, specialty_code, array_to_string(keywords, '|') AS kw FROM red_flag_rules WHERE active")
            .query().listOfRows();

        List<RedFlag> flags = new ArrayList<>();
        String flagSpecialty = null;
        for (Map<String, Object> r : rules) {
            if (matchesAny(text, String.valueOf(r.get("kw")))) {
                flags.add(new RedFlag((String) r.get("code"), (String) r.get("label"), (String) r.get("advice")));
                if (flagSpecialty == null) flagSpecialty = (String) r.get("specialty_code");
            }
        }

        String urgency = flags.isEmpty() ? "GREEN" : "RED";
        List<String> vitalNotes = new ArrayList<>();
        Double spo2 = num(vitals, "spo2"), temp = num(vitals, "temperature"), hr = num(vitals, "heartRate"), sys = num(vitals, "systolic");
        if (spo2 != null && spo2 < 92) { urgency = "RED"; vitalNotes.add("SpO2 " + fmt(spo2) + "% is low"); }
        else if (spo2 != null && spo2 < 95) { urgency = max(urgency, "AMBER"); vitalNotes.add("SpO2 " + fmt(spo2) + "% is borderline"); }
        if (sys != null && sys < 90) { urgency = "RED"; vitalNotes.add("systolic BP " + fmt(sys) + " is low"); }
        if (hr != null && hr > 130) { urgency = "RED"; vitalNotes.add("heart rate " + fmt(hr) + " is high"); }
        if (temp != null && temp >= 40.0) { urgency = "RED"; vitalNotes.add("temperature " + fmt(temp) + " C is very high"); }
        else if (temp != null && temp >= 38.5) { urgency = max(urgency, "AMBER"); vitalNotes.add("temperature " + fmt(temp) + " C is raised"); }
        if (age != null && age <= 1 && "GREEN".equals(urgency)) urgency = "AMBER";

        String specialtyCode = flagSpecialty != null ? flagSpecialty : bestSpecialty(text, age);
        String specialty = jdbc.sql("SELECT name FROM specialties WHERE code = :c").param("c", specialtyCode)
            .query(String.class).optional().orElse("General Medicine");

        String who = (age == null ? "Patient" : age + "y " + (sex == null ? "" : sex)).trim();
        Map<String, Object> sbar = new LinkedHashMap<>();
        sbar.put("situation", who + (village == null || village.isBlank() ? "" : " in " + village) + ": " + complaint);
        sbar.put("background", vitals == null || vitals.isEmpty() ? "No vitals recorded." : "Vitals: " + vitals.entrySet().stream()
            .map(e -> e.getKey() + " " + e.getValue()).collect(Collectors.joining(", ")) + ".");
        sbar.put("assessment", "Urgency " + urgency + (flags.isEmpty() ? "" : "; red flags: " + flags.stream().map(RedFlag::label).collect(Collectors.joining(", ")))
            + (vitalNotes.isEmpty() ? "" : "; " + String.join(", ", vitalNotes)) + ". Automated triage, not a diagnosis.");
        sbar.put("recommendation", "Route to " + specialty + "." + (flags.isEmpty() ? "" : " " + flags.get(0).advice()));
        return new Result(urgency, flags, specialty, sbar);
    }

    private String bestSpecialty(String text, Integer age) {
        List<Map<String, Object>> specs = jdbc.sql("SELECT code, array_to_string(keywords, '|') AS kw FROM specialties").query().listOfRows();
        boolean child = age != null && age <= 12;
        String best = child ? "PEDIATRICS" : "GENERAL";
        int bestScore = child ? 1 : 0;
        for (Map<String, Object> s : specs) {
            int score = 0;
            for (String kw : String.valueOf(s.get("kw")).split("[|]")) if (!kw.isBlank() && text.contains(kw)) score++;
            if (score > bestScore) { best = (String) s.get("code"); bestScore = score; }
        }
        return best;
    }

    private static boolean matchesAny(String text, String pipeSeparated) {
        for (String kw : pipeSeparated.split("[|]")) {
            if (!kw.isBlank() && text.contains(kw.trim().toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private static Double num(Map<String, Object> v, String k) {
        if (v == null || !(v.get(k) instanceof Number n)) return null;
        return n.doubleValue();
    }
    private static String fmt(double d) { return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d); }
    private static String max(String a, String b) { return rank(a) >= rank(b) ? a : b; }
    private static int rank(String u) { return switch (u) { case "RED" -> 2; case "AMBER" -> 1; default -> 0; }; }
}
