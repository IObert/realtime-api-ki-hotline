## KI-Sprachassistent per Telefon  

### Beschreibung  
Dieses Projekt zeigt, wie man die OpenAI Real-Time API mit Twilio kombiniert, um einen KI-gestützten Sprachassistenten per Telefon bereitzustellen. Der Assistent reagiert in Echtzeit auf Audioeingaben und kann Anfragen verarbeiten, wie z. B. den Preis für Reisen zu berechnen.  

### Features  
- Echtzeit-Audioverarbeitung mit Twilio und OpenAI.  
- Interaktive Sprachsteuerung durch WebSocket-Verbindungen.  
- Erweiterbar durch benutzerdefinierte Funktionen, z. B. Reiseberechnungen.  

### Voraussetzungen  
- **Node.js** (mind. Version 16)  
- Twilio-Konto mit Telefonnummer.  
- OpenAI API-Schlüssel mit Zugang zur Beta der Real-Time API.  
- Ngrok oder ein ähnlicher Dienst, um den lokalen Server öffentlich verfügbar zu machen.  

### Installation  
1. **Repository klonen**:  
   ```bash
   git clone https://github.com/IObert/realtime-api-ki-hotline
   cd realtime-api-ki-hotline
   ```  

2. **Abhängigkeiten installieren**:  
   ```bash
   npm install
   ```  

3. **.env-Datei erstellen**:  
   Legen Sie eine `.env`-Datei an und tragen Sie Ihren OpenAI API-Schlüssel ein:  
   ```env
   OPENAI_API_KEY=dein_openai_api_schlüssel
   ```  

### Nutzung  
1. **Server starten**:  
   ```bash
   node ki-hotline.js
   ```  

2. **Ngrok starten**:  
   ```bash
   ngrok http 3000
   ```  
   Notieren Sie sich die öffentliche URL.  

3. **Twilio konfigurieren**:  
   - Gehen Sie in die Twilio-Konsole.  
   - Konfigurieren Sie Ihre Telefonnummer so, dass sie bei einem eingehenden Anruf die öffentliche Ngrok-URL mit dem Endpunkt `/incoming-call` aufruft (z. B. `https://<ngrok-subdomain>.ngrok.io/incoming-call`).  

### Hinweise  
- Die OpenAI Real-Time API befindet sich im **Beta-Status**. Änderungen an der API-Spezifikation sind möglich.  
- Die Audioverarbeitung funktioniert derzeit am besten mit englischen Anfragen; für andere Sprachen kann es zu Fehlern oder unerwartetem Verhalten kommen.  
- Das maximale Kontextfenster des Modells ist begrenzt. Lange Gespräche können dazu führen, dass frühere Informationen vergessen werden.  

### Erweiterungsmöglichkeiten  
- **Weitere Funktionen hinzufügen**: Passen Sie die Konfigurationsparameter in der `session.update`-Funktion an.  
- **Verbesserung der Spracherkennung**: Optimieren Sie die Einstellungen für `input_audio_format` und `output_audio_format` oder experimentieren Sie mit anderen Turn-Detection-Methoden.  
- **Einsatz in anderen Szenarien**: Integrieren Sie den Sprachassistenten in Kontaktzentren oder automatisierte Telefonsysteme.  

### Lizenz  
Dieses Projekt steht unter der MIT-Lizenz. Weitere Informationen finden Sie in der Datei `LICENSE`.  

---  
Für weitere Fragen oder Feedback besuchen Sie die OpenAI- und Twilio-Dokumentationen.  