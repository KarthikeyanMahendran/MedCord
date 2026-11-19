package com.medcord.outbreak;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class SyndromeTest {
    @Test
    void feverWithRashIsOneGroup() {
        assertThat(Syndrome.classify("Child with fever and a red rash for two days", null)).containsExactly(Syndrome.FEVER_RASH);
        // a measured temperature counts as fever even when the words do not say it
        assertThat(Syndrome.classify("Boy with itchy rash on the chest", 38.5)).containsExactly(Syndrome.FEVER_RASH);
    }

    @Test
    void aSingleSymptomIsNotEnough() {
        assertThat(Syndrome.classify("Mild itchy rash on the arm for two days", 37.0)).isEmpty();
        assertThat(Syndrome.classify("Fever since last night", null)).isEmpty();
    }

    @Test
    void otherGroups() {
        assertThat(Syndrome.classify("Watery diarrhoea and vomiting since morning", null)).containsExactly(Syndrome.WATERBORNE);
        assertThat(Syndrome.classify("Cough and fever for three days", null)).containsExactly(Syndrome.RESPIRATORY);
        assertThat(Syndrome.classify("Cannot breathe properly", null)).containsExactly(Syndrome.RESPIRATORY);
        assertThat(Syndrome.classify("Yellow eyes and tiredness", null)).containsExactly(Syndrome.JAUNDICE);
        assertThat(Syndrome.classify("Fever with headache and joint pain", null)).containsExactly(Syndrome.FEVER_BODY);
    }

    @Test
    void everyGroupHasGuidanceAndASaneThreshold() {
        for (Syndrome s : Syndrome.values()) {
            assertThat(s.guidance()).hasSizeGreaterThanOrEqualTo(3);
            assertThat(s.threshold()).isBetween(3, 6);
            assertThat(s.label()).isNotBlank();
        }
        assertThat(List.of(Syndrome.values())).hasSize(5);
    }
}
