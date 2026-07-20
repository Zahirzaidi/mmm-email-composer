insert into categories (name)
select 'MMM Members'
where not exists (
    select 1
    from categories
    where name = 'MMM Members'
);

insert into groups (category_id, name)
select categories.id, 'MMM Members'
from categories
where categories.name = 'MMM Members'
and not exists (
    select 1
    from groups
    where groups.category_id = categories.id
    and groups.name = 'MMM Members'
);
