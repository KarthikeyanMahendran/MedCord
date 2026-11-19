package com.medcord.safety;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PhiDetectorTest {

    @Test
    void detectsAndRedactsCommonClinicalIdentifiersWithoutFlaggingDoctors() {
        String text = "Dr. Priya Raman reviewed Patient: John Doe, MRN 482910, DOB 04/12/1978, phone 555-234-5678, Bed 4B.";
        PhiDetector.ScanResult res = PhiDetector.scan(text);

        assertThat(res.hasPhi()).isTrue();
        assertThat(res.categories()).contains("PATIENT_NAME", "MRN_ID", "DOB", "PHONE", "BED_ROOM");
        assertThat(res.redactedText()).contains("Dr. Priya Raman");
        assertThat(res.redactedText()).doesNotContain("John Doe", "482910", "04/12/1978", "555-234-5678", "Bed 4B");
    }

    @Test
    void respectsCustomCommunityBlockedTermsAndCleanClinicalText() {
        String clean = "62M presenting with acute chest pain, ST-elevation in V2-V4, troponin 1.4. Cath lab activated.";
        assertThat(PhiDetector.scan(clean).hasPhi()).isFalse();

        PhiDetector.ScanResult withBlocked = PhiDetector.scan(
            "Transferred from St. Jude Ward East for urgent PCI",
            List.of("St. Jude Ward East")
        );
        assertThat(withBlocked.hasPhi()).isTrue();
        assertThat(withBlocked.categories()).containsExactly("RESTRICTED_TERM");
        assertThat(withBlocked.redactedText()).contains("[REDACTED]").doesNotContain("St. Jude Ward East");
    }
}
