import sys
import os
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# Ajoute backend/ au sys.path pour que le package `app` soit importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Charge le .env depuis backend/
load_dotenv(Path(__file__).parent.parent / ".env")

# Import des modèles pour l'autogénération des migrations
from app.database import Base
from app import models  # noqa: F401 - enregistre les modèles dans Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Surcharge l'URL avec DATABASE_URL depuis l'environnement
database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
