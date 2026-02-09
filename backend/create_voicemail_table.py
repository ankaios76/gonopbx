from database import engine, Base
from routers.voicemail import VoicemailRecord
Base.metadata.create_all(bind=engine)
print("✅ Voicemail table created!")
