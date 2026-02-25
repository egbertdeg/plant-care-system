from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    mqtt_broker: str
    mqtt_port: int = 8883
    mqtt_user: str
    mqtt_password: str

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
