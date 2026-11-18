package com.medcord.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class UserRepositoryTest {
    @Autowired UserRepository users;
    @Autowired ProfessionalProfileRepository profiles;

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setPasswordHash("x");
        u.setDisplayName("Dr Test");
        return users.saveAndFlush(u);
    }

    @Test
    void savesAndFindsCaseInsensitive() {
        User u = newUser("Doc@Example.com");
        assertThat(users.findByEmailIgnoreCase("doc@example.COM")).get().extracting(User::getId).isEqualTo(u.getId());
        assertThat(u.getStatus()).isEqualTo(User.Status.PENDING);
    }

    @Test
    void emailMustBeUniqueIgnoringCase() {
        newUser("a@b.com");
        assertThatThrownBy(() -> newUser("A@B.com")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void licenseUniquePerCountry() {
        User a = newUser("a@x.com"), b = newUser("b@x.com");
        profiles.saveAndFlush(profile(a, "IN", "L1"));
        assertThatThrownBy(() -> profiles.saveAndFlush(profile(b, "IN", "L1")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    private ProfessionalProfile profile(User u, String country, String lic) {
        ProfessionalProfile p = new ProfessionalProfile();
        p.setUserId(u.getId());
        p.setSpecialty("Cardiology");
        p.setLicenseCountry(country);
        p.setLicenseNumber(lic);
        return p;
    }
}
