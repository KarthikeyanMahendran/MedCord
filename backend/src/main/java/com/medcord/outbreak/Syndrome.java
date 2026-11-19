package com.medcord.outbreak;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Symptom groups the radar watches. Matching is plain keyword rules, so every alert can be explained:
 * "3 cases mentioned fever and a rash in the same area within 72 hours". It never diagnoses.
 */
public enum Syndrome {
    FEVER_RASH("Fever with rash", 3, List.of(
        "Keep suspected patients away from young children and pregnant women where you can.",
        "Check the vaccination status of children in the same household and street.",
        "Report the cluster to the district surveillance officer today.",
        "Give fluids and rest. Refer anyone with breathing trouble, drowsiness, fits or red eyes with severe weakness.")),
    WATERBORNE("Diarrhoea or vomiting", 3, List.of(
        "Promote oral rehydration solution (ORS) in every affected household.",
        "Check the shared drinking-water source. Boil or chlorinate water until it is cleared.",
        "Look for a common event or food source (festival, wedding, shared well).",
        "Refer anyone with severe dehydration, blood in stool, or a child who cannot drink. Report to the district surveillance officer.")),
    RESPIRATORY("Cough, fever or breathing trouble", 4, List.of(
        "Ask coughing patients to wear a mask and to stay away from crowded places.",
        "Measure oxygen (SpO2) on everyone with breathing trouble. Refer anyone below 94%.",
        "Ventilate shared rooms and ask households to keep windows open.",
        "Screen for TB and other conditions as per local protocol. Report to the district surveillance officer.")),
    JAUNDICE("Jaundice (yellow eyes or skin)", 3, List.of(
        "Check the drinking-water source and sanitation near the affected households.",
        "Promote hand washing and safe water. Avoid street food and uncooked food until cleared.",
        "Refer pregnant women with jaundice urgently.",
        "Report the cluster to the district surveillance officer.")),
    FEVER_BODY("Fever with body ache", 4, List.of(
        "Look for stagnant water around homes and remove it. Use bed nets, especially for children and pregnant women.",
        "Ask anyone with fever for more than 3 days to be tested for malaria and dengue.",
        "Refer anyone with bleeding, severe stomach pain, persistent vomiting or drowsiness at once.",
        "Report the cluster to the district surveillance officer.")),
    ;

    public static final String DISCLAIMER = "Decision support only. Follow your district health officer's guidance.";

    private static final Pattern P_FEVER = Pattern.compile("fever|febrile|high temperature|chills|bukhar|kaichal|jwaram");
    private static final Pattern P_RASH = Pattern.compile("rash|spots|blister|measles|chickenpox|\\bpox\\b|red patches");
    private static final Pattern P_DIARRHOEA = Pattern.compile("diarrh|loose stool|loose motion|watery stool|vomit|cholera|dysentery");
    private static final Pattern P_COUGH = Pattern.compile("cough|wheez|pneumonia|chest congestion");
    private static final Pattern P_BREATH = Pattern.compile("cannot breathe|can't breathe|breathless|short of breath|breathing trouble|difficulty breathing|fast breathing");
    private static final Pattern P_JAUNDICE = Pattern.compile("jaundice|yellow eyes|yellow skin|yellowish|hepatitis");
    private static final Pattern P_BODY_ACHE = Pattern.compile("body ache|body pain|joint pain|bone pain|headache|dengue|malaria|mosquito|muscle pain");

    private final String label;
    private final int threshold;
    private final List<String> guidance;

    Syndrome(String label, int threshold, List<String> guidance) {
        this.label = label; this.threshold = threshold; this.guidance = guidance;
    }

    public String label() { return label; }
    public int threshold() { return threshold; }
    public List<String> guidance() { return guidance; }

    /** Which syndromes a case belongs to. A case can match more than one. */
    public static List<Syndrome> classify(String complaint, Double temperature) {
        String t = complaint == null ? "" : complaint.toLowerCase(Locale.ROOT);
        boolean fever = P_FEVER.matcher(t).find() || (temperature != null && temperature >= 38.0);
        boolean rash = P_RASH.matcher(t).find();
        boolean bodyAche = P_BODY_ACHE.matcher(t).find();
        java.util.ArrayList<Syndrome> out = new java.util.ArrayList<>();
        if (fever && rash) out.add(FEVER_RASH);
        if (P_DIARRHOEA.matcher(t).find()) out.add(WATERBORNE);
        if ((P_COUGH.matcher(t).find() && fever) || P_BREATH.matcher(t).find()) out.add(RESPIRATORY);
        if (P_JAUNDICE.matcher(t).find()) out.add(JAUNDICE);
        if (fever && bodyAche && !rash) out.add(FEVER_BODY);
        return out;
    }
}
