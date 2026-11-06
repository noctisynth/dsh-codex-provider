use serde::Deserialize;

use crate::error::Error;

#[derive(Deserialize)]
struct Catalog {
    models: Vec<CatalogModel>,
}

#[derive(Deserialize)]
struct CatalogModel {
    slug: String,
    display_name: String,
    visibility: String,
}

#[derive(Debug, PartialEq)]
pub(crate) struct Model {
    pub id: String,
    pub name: String,
}

pub(crate) fn parse_catalog(json: &[u8]) -> Result<Vec<Model>, Error> {
    let catalog: Catalog = serde_json::from_slice(json).map_err(Error::Catalog)?;
    Ok(catalog
        .models
        .into_iter()
        .filter(|model| model.visibility == "list")
        .map(|model| Model {
            id: model.slug,
            name: model.display_name,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{Model, parse_catalog};

    #[test]
    fn visible_models_keep_server_order() -> Result<(), crate::error::Error> {
        let models = parse_catalog(
            br#"{"models":[
            {"slug":"second","display_name":"Second","visibility":"list"},
            {"slug":"hidden","display_name":"Hidden","visibility":"hidden"},
            {"slug":"first","display_name":"First","visibility":"list"}
        ]}"#,
        )?;
        assert_eq!(
            models,
            vec![
                Model {
                    id: "second".into(),
                    name: "Second".into()
                },
                Model {
                    id: "first".into(),
                    name: "First".into()
                },
            ]
        );
        Ok(())
    }

    #[test]
    fn standard_api_catalog_is_not_a_subscription_catalog() {
        assert!(parse_catalog(br#"{"data":[]}"#).is_err());
    }
}
