package com.medcord;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
@org.springframework.boot.context.properties.EnableConfigurationProperties(com.medcord.nexconn.NexconnProperties.class)
public class MedcordBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(MedcordBackendApplication.class, args);
	}

}
