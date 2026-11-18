package com.medcord.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "medcord.ai")
public class AiProperties {
    private String sarvamApiKey = "";
    private String sarvamBaseUrl = "https://api.sarvam.ai/v2";
    private String chatModel = "sarvam-105b";
    private String embeddingModel = "embeddinggemma-2";

    public String getSarvamApiKey() { return sarvamApiKey; }
    public void setSarvamApiKey(String sarvamApiKey) { this.sarvamApiKey = sarvamApiKey; }

    public String getSarvamBaseUrl() { return sarvamBaseUrl; }
    public void setSarvamBaseUrl(String sarvamBaseUrl) { this.sarvamBaseUrl = sarvamBaseUrl; }

    public String getChatModel() { return chatModel; }
    public void setChatModel(String chatModel) { this.chatModel = chatModel; }

    public String getEmbeddingModel() { return embeddingModel; }
    public void setEmbeddingModel(String embeddingModel) { this.embeddingModel = embeddingModel; }
}
