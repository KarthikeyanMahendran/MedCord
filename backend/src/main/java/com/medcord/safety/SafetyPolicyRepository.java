package com.medcord.safety;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SafetyPolicyRepository extends JpaRepository<SafetyPolicy, UUID> {}
