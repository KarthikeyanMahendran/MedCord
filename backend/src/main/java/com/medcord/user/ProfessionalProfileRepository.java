package com.medcord.user;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfessionalProfileRepository extends JpaRepository<ProfessionalProfile, UUID> {}
